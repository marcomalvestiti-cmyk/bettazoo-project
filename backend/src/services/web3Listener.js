const { ethers } = require('ethers')
const mongoose = require('mongoose')
const Order = require('../models/Order')
const Event = require('../models/Event')
const BetMatch = require('../models/BetMatch')

const ESCROW_ABI = [
  'event OfferCreated(uint256 indexed offerId, address indexed placer, string eventId, uint8 outcome, uint256 odds, uint256 liability)',
  'event OfferMatched(uint256 indexed matchId, uint256 indexed offerId, address indexed bettor, uint256 bettorStake, uint256 placerLiability)',
  'event EventResolved(string eventId, uint8 winningOutcome)',
  'event WinningsPaid(address indexed winner, uint256 amount)',
  'function offers(uint256 offerId) view returns (uint256 id, address placer, string eventId, uint8 outcome, uint256 odds, uint256 liability, uint256 remainingLiability, bool active)',
]

const DEPLOY_BLOCK = parseInt(process.env.ESCROW_DEPLOY_BLOCK ?? '0')
// Alchemy free tier: max 10 blocks per eth_getLogs. Public RPCs: up to 10 000.
// Set ESCROW_CHUNK_SIZE=10 for Alchemy free, 2000 for Infura/QuickNode, 9000 for public RPCs.
const CHUNK_SIZE = parseInt(process.env.ESCROW_CHUNK_SIZE ?? '2000')

// ── SyncState — tracks last synced block across restarts ──────────────────────
// Stored in MongoDB so Railway restarts resume from where they left off instead
// of re-loading the full blockchain history every time (the main OOM trigger).
const SyncState = mongoose.models.SyncState ?? mongoose.model(
  'SyncState',
  new mongoose.Schema(
    { _id: String, lastBlock: { type: Number, default: 0 } },
    { collection: 'syncstate' }
  )
)

async function getLastSyncedBlock() {
  try {
    const doc = await SyncState.findById('web3').lean()
    const block = doc?.lastBlock ?? DEPLOY_BLOCK
    console.log(`[${ts()}] [Sync] Last synced block from DB: ${block}`)
    return block
  } catch (err) {
    console.warn(`[${ts()}] [Sync] Could not read lastSyncedBlock: ${err.message} — using DEPLOY_BLOCK=${DEPLOY_BLOCK}`)
    return DEPLOY_BLOCK
  }
}

async function saveLastSyncedBlock(blockNumber) {
  try {
    await SyncState.findByIdAndUpdate('web3', { lastBlock: blockNumber }, { upsert: true })
    console.log(`[${ts()}] [Sync] lastSyncedBlock saved: ${blockNumber}`)
  } catch (err) {
    console.warn(`[${ts()}] [Sync] Could not save lastSyncedBlock: ${err.message}`)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function heapMB() {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
}

/**
 * Retries fn up to maxAttempts times, backing off on 429 / rate-limit errors.
 * Other errors are thrown immediately.
 */
async function withRetry(fn, label, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const msg = (err?.message ?? '').toLowerCase()
      const is429 =
        msg.includes('429') ||
        msg.includes('too many requests') ||
        msg.includes('rate limit') ||
        msg.includes('rate_limit') ||
        msg.includes('exceeded')
      if (attempt < maxAttempts && is429) {
        const delay = Math.pow(2, attempt) * 1_000 // 2 s, 4 s
        console.warn(`[${ts()}] [${label}] Rate limited — retry ${attempt}/${maxAttempts - 1} in ${delay}ms`)
        await sleep(delay)
      } else {
        throw err
      }
    }
  }
}

function ts() { return new Date().toISOString() }

// ── processEventsInChunks ─────────────────────────────────────────────────────
// Processes blockchain events in 9 000-block chunks WITHOUT accumulating them
// all in RAM. onChunk is called per chunk and the chunk array is discarded
// immediately after (GC-eligible), keeping heap usage flat regardless of
// how many total events exist on-chain.
//
// Returns total number of events processed.
async function processEventsInChunks(contract, eventName, fromBlock, toBlock, onChunk) {
  let totalProcessed = 0
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock)
    try {
      const chunk = await withRetry(
        () => contract.queryFilter(eventName, start, end),
        `Sync/${eventName} ${start}-${end}`
      )
      if (chunk.length > 0) {
        console.log(
          `[${ts()}] [Sync][${eventName}] blocks ${start}–${end}: ` +
          `${chunk.length} event(s) | heap ${heapMB()}MB`
        )
        await onChunk(chunk)
        totalProcessed += chunk.length
        // chunk goes out of scope here — GC can reclaim all event objects
      }
    } catch (err) {
      console.warn(`[${ts()}] [Sync][${eventName}] chunk ${start}–${end} failed after retries: ${err.message}`)
    }
  }
  return totalProcessed
}

// ── syncHistoricalEvents ─────────────────────────────────────────────────────

// Batch size and inter-batch delay for on-chain offers() reads.
// Kept small to stay under public RPC rate limits.
const OFFER_BATCH_SIZE  = 3
const OFFER_BATCH_DELAY = 800 // ms between batches

async function syncHistoricalEvents(contract) {
  // Start from where we left off, not from scratch every time.
  const fromBlock = await getLastSyncedBlock()

  let toBlock
  try {
    toBlock = await withRetry(
      () => contract.runner.provider.getBlockNumber(),
      'Sync/getBlockNumber'
    )
  } catch (err) {
    console.warn(`[${ts()}] [Sync] Could not get block number: ${err.message} — skipping historical sync`)
    return
  }

  if (fromBlock >= toBlock) {
    console.log(`[${ts()}] [Sync] Already up to date at block ${toBlock} — skipping historical sync`)
    return
  }

  const totalBlocks = toBlock - fromBlock
  console.log(
    `\n[${ts()}] [Sync] ── Historical sync: blocks ${fromBlock}–${toBlock} ` +
    `(${totalBlocks.toLocaleString()} blocks) | heap ${heapMB()}MB ──`
  )
  if (totalBlocks > 500_000) {
    console.warn(
      `[${ts()}] [Sync] Block range is very large (${totalBlocks.toLocaleString()} blocks). ` +
      `Set ESCROW_DEPLOY_BLOCK in your env to the contract deploy block to speed this up.`
    )
  }

  // Pass 1: Stream OfferMatched events to build a compact aggregation map.
  // We keep ONLY { offerId -> BigInt } — NOT the event objects — so heap stays tiny
  // even with thousands of matches.
  const totalMatchedByOffer = {}
  const matchedCount = await processEventsInChunks(
    contract, 'OfferMatched', fromBlock, toBlock,
    async (chunk) => {
      for (const ev of chunk) {
        const id = Number(ev.args.offerId)
        totalMatchedByOffer[id] = (totalMatchedByOffer[id] ?? BigInt(0)) + BigInt(ev.args.placerLiability)
      }
      // chunk dereferenced here — event objects freed by GC
    }
  )
  console.log(
    `[${ts()}] [Sync] OfferMatched total: ${matchedCount} ` +
    `(${Object.keys(totalMatchedByOffer).length} unique offers affected) | heap ${heapMB()}MB`
  )
  await sleep(2_000) // breathe before next pass to avoid 429 bursts

  // Pass 2: Stream OfferCreated events, upsert to MongoDB per chunk.
  // Each chunk is processed and discarded before the next one is fetched,
  // so RAM usage is bounded by CHUNK_SIZE, not by total event count.
  const createdCount = await processEventsInChunks(
    contract, 'OfferCreated', fromBlock, toBlock,
    async (chunk) => {
      for (let i = 0; i < chunk.length; i += OFFER_BATCH_SIZE) {
        const batch = chunk.slice(i, i + OFFER_BATCH_SIZE)

        await Promise.all(batch.map(async (ev) => {
          const { offerId, placer, eventId, outcome, odds, liability } = ev.args
          const id = Number(offerId)

          const computedRemaining = BigInt(liability) - (totalMatchedByOffer[id] ?? BigInt(0))
          let onChainActive    = computedRemaining > BigInt(0)
          let onChainRemaining = computedRemaining.toString()

          try {
            const onChain = await withRetry(() => contract.offers(id), `Sync/offers#${id}`, 4)
            onChainActive    = onChain.active
            onChainRemaining = onChain.remainingLiability.toString()
          } catch (err) {
            console.warn(`[${ts()}] [Sync] on-chain read for offer #${id} failed (using computed): ${err.message}`)
          }

          await Order.findOneAndUpdate(
            { offerId: id },
            {
              offerId:            id,
              placer:             placer.toLowerCase(),
              eventId,
              outcome:            Number(outcome),
              odds:               Number(odds),
              oddsDecimal:        Number(odds) / 10000,
              liability:          liability.toString(),
              remainingLiability: onChainRemaining,
              active:             onChainActive,
              txHash:             ev.transactionHash,
              blockNumber:        ev.blockNumber,
            },
            { upsert: true, new: true }
          )

          await Event.findOneAndUpdate(
            { eventId }, { eventId },
            { upsert: true, setDefaultsOnInsert: true }
          )
        }))

        if (i + OFFER_BATCH_SIZE < chunk.length) await sleep(OFFER_BATCH_DELAY)
      }
      // chunk dereferenced — event objects freed by GC
    }
  )
  console.log(`[${ts()}] [Sync] OfferCreated total: ${createdCount} | heap ${heapMB()}MB`)
  await sleep(2_000) // breathe before next pass

  // Pass 2.5: Stream OfferMatched again — a second pass, not merged into Pass 1 above —
  // because BetMatch needs each offer's placer/eventId/outcome/odds, which only exist in
  // Mongo once Pass 2 (OfferCreated) has run. Pass 1 stays a lightweight aggregation-only
  // pass (no DB writes) so its memory footprint doesn't change.
  const betMatchCount = await processEventsInChunks(
    contract, 'OfferMatched', fromBlock, toBlock,
    async (chunk) => {
      for (const ev of chunk) {
        const { matchId, offerId, bettor, bettorStake, placerLiability } = ev.args
        const order = await Order.findOne({ offerId: Number(offerId) }).lean()
        if (!order) continue // offer not indexed (shouldn't happen after Pass 2, skip defensively)
        await BetMatch.findOneAndUpdate(
          { matchId: Number(matchId) },
          {
            matchId:         Number(matchId),
            offerId:         Number(offerId),
            placer:          order.placer,
            bettor:          bettor.toLowerCase(),
            eventId:         order.eventId,
            outcome:         order.outcome,
            odds:            order.odds,
            bettorStake:     bettorStake.toString(),
            placerLiability: placerLiability.toString(),
          },
          { upsert: true, setDefaultsOnInsert: true }
        )
      }
    }
  )
  console.log(`[${ts()}] [Sync] BetMatch total: ${betMatchCount} | heap ${heapMB()}MB`)
  await sleep(2_000) // breathe before next pass

  // Pass 3: Stream EventResolved events, update DB per chunk.
  const resolvedCount = await processEventsInChunks(
    contract, 'EventResolved', fromBlock, toBlock,
    async (chunk) => {
      for (const ev of chunk) {
        const { eventId, winningOutcome } = ev.args
        await Event.findOneAndUpdate(
          { eventId },
          { eventId, resolved: true, winningOutcome: Number(winningOutcome), resolvedAt: new Date() },
          { upsert: true }
        )
        await Order.updateMany({ eventId }, { active: false })
        await BetMatch.updateMany({ eventId }, { settled: true, settledOutcome: Number(winningOutcome) })
      }
    }
  )

  // Persist the high-water mark so the next Railway restart resumes from here.
  await saveLastSyncedBlock(toBlock)

  console.log(
    `[${ts()}] [Sync] ── Done: ${createdCount} offers, ${matchedCount} matches, ` +
    `${resolvedCount} events resolved | heap ${heapMB()}MB ──\n`
  )
}

// ── startListener ─────────────────────────────────────────────────────────────

/**
 * @param {ethers.Provider} provider
 * @param {string}          contractAddress
 * @param {object}          io               - Socket.IO server (may be null)
 * @param {boolean}         skipHistoricalSync - true on reconnect (DB already fresh)
 */
async function startListener(provider, contractAddress, io, skipHistoricalSync = false) {
  const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider)
  console.log(`[${ts()}] [Web3] Listener starting on contract ${contractAddress}`)

  if (skipHistoricalSync) {
    console.log(`[${ts()}] [Web3] Historical sync skipped — reconnect mode, DB already populated`)
  } else {
    await syncHistoricalEvents(contract)
  }

  // ── Real-time subscriptions ────────────────────────────────────────────────

  contract.on('OfferCreated', async (offerId, placer, eventId, outcome, odds, liability, ev) => {
    try {
      await Order.findOneAndUpdate(
        { offerId: Number(offerId) },
        {
          offerId:            Number(offerId),
          placer:             placer.toLowerCase(),
          eventId,
          outcome:            Number(outcome),
          odds:               Number(odds),
          oddsDecimal:        Number(odds) / 10000,
          liability:          liability.toString(),
          remainingLiability: liability.toString(),
          active:             true,
          txHash:             ev.log.transactionHash,
          blockNumber:        ev.log.blockNumber,
        },
        { upsert: true, new: true }
      )
      await Event.findOneAndUpdate({ eventId }, { eventId }, { upsert: true, setDefaultsOnInsert: true })
      io?.emit('offer:created', { offerId: Number(offerId), placer, eventId, outcome: Number(outcome) })
      console.log(`[${ts()}] [OfferCreated] offerId=${offerId} eventId=${eventId} | heap ${heapMB()}MB`)
    } catch (err) {
      console.error(`[${ts()}] [OfferCreated] error: ${err.message}`)
    }
  })

  contract.on('OfferMatched', async (matchId, offerId, bettor, bettorStake, placerLiability, ev) => {
    try {
      const id = Number(offerId)
      let onChainActive = true, onChainRemaining = '0'
      try {
        const onChain = await contract.offers(id)
        onChainActive    = onChain.active
        onChainRemaining = onChain.remainingLiability.toString()
      } catch {
        const order = await Order.findOne({ offerId: id })
        if (order) {
          const newRemaining = BigInt(order.remainingLiability) - BigInt(placerLiability)
          onChainRemaining   = newRemaining.toString()
          onChainActive      = newRemaining > BigInt(0)
        }
      }
      await Order.findOneAndUpdate(
        { offerId: id },
        { remainingLiability: onChainRemaining, active: onChainActive }
      )

      // Persist the match itself for realized P&L (used by vault stop-loss). eventId/
      // outcome/odds come from the offer, not this event — read from Mongo first, and
      // fall back to an on-chain read in the rare case OfferCreated hasn't landed yet
      // (e.g. this handler racing a same-block createOffer+acceptOffers).
      let offerInfo = await Order.findOne({ offerId: id }).lean()
      if (!offerInfo) {
        try {
          const onChain = await contract.offers(id)
          offerInfo = { placer: onChain.placer.toLowerCase(), eventId: onChain.eventId, outcome: Number(onChain.outcome), odds: Number(onChain.odds) }
        } catch (err) {
          console.warn(`[${ts()}] [OfferMatched] could not resolve offer #${id} for BetMatch: ${err.message}`)
        }
      }
      if (offerInfo) {
        await BetMatch.findOneAndUpdate(
          { matchId: Number(matchId) },
          {
            matchId:         Number(matchId),
            offerId:         id,
            placer:          offerInfo.placer,
            bettor:          bettor.toLowerCase(),
            eventId:         offerInfo.eventId,
            outcome:         offerInfo.outcome,
            odds:            offerInfo.odds,
            bettorStake:     bettorStake.toString(),
            placerLiability: placerLiability.toString(),
          },
          { upsert: true, setDefaultsOnInsert: true }
        )
      }

      io?.emit('offer:matched', { matchId: Number(matchId), offerId: id, bettor })
      console.log(`[${ts()}] [OfferMatched] matchId=${matchId} offerId=${offerId} | heap ${heapMB()}MB`)
    } catch (err) {
      console.error(`[${ts()}] [OfferMatched] error: ${err.message}`)
    }
  })

  contract.on('EventResolved', async (eventId, winningOutcome) => {
    try {
      await Event.findOneAndUpdate(
        { eventId },
        { resolved: true, winningOutcome: Number(winningOutcome), resolvedAt: new Date() }
      )
      await Order.updateMany({ eventId }, { active: false })
      await BetMatch.updateMany({ eventId }, { settled: true, settledOutcome: Number(winningOutcome) })
      io?.emit('event:resolved', { eventId, winningOutcome: Number(winningOutcome) })
      console.log(`[${ts()}] [EventResolved] eventId=${eventId} winningOutcome=${winningOutcome}`)
    } catch (err) {
      console.error(`[${ts()}] [EventResolved] error: ${err.message}`)
    }
  })

  provider.on?.('error', (err) => {
    console.error(`[${ts()}] [Web3] Provider error: ${err?.message || err}`)
  })

  console.log(`[${ts()}] [Web3] Real-time subscriptions active.`)
}

module.exports = { startListener, syncHistoricalEvents }
