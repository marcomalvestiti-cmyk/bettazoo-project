const { ethers } = require('ethers')
const Order = require('../models/Order')
const Event = require('../models/Event')

const ESCROW_ABI = [
  'event OfferCreated(uint256 indexed offerId, address indexed placer, string eventId, uint8 outcome, uint256 odds, uint256 liability)',
  'event OfferMatched(uint256 indexed matchId, uint256 indexed offerId, address indexed bettor, uint256 bettorStake, uint256 placerLiability)',
  'event EventResolved(string eventId, uint8 winningOutcome)',
  'event WinningsPaid(address indexed winner, uint256 amount)',
  'function offers(uint256 offerId) view returns (uint256 id, address placer, string eventId, uint8 outcome, uint256 odds, uint256 liability, uint256 remainingLiability, bool active)',
]

const DEPLOY_BLOCK = parseInt(process.env.ESCROW_DEPLOY_BLOCK ?? '0')
// Most public RPCs cap eth_getLogs to 10 000 blocks.
const CHUNK_SIZE = 9_000

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

// ── queryAllEvents ───────────────────────────────────────────────────────────

// Paginated queryFilter: handles RPC block-range limits and retries on 429.
async function queryAllEvents(contract, eventName, fromBlock) {
  let toBlock
  try {
    toBlock = await withRetry(
      () => contract.runner.provider.getBlockNumber(),
      `Sync/getBlockNumber`
    )
  } catch {
    console.warn(`[${ts()}] [Sync] Could not get block number — trying single queryFilter for ${eventName}`)
    return contract.queryFilter(eventName, fromBlock, 'latest')
  }

  if (fromBlock > toBlock) return []

  const totalBlocks = toBlock - fromBlock
  if (totalBlocks > 500_000) {
    console.warn(
      `[${ts()}] [Sync] Block range is very large (${totalBlocks} blocks). ` +
      `Set ESCROW_DEPLOY_BLOCK in your env to the contract deploy block to speed this up.`
    )
  }

  const events = []
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock)
    try {
      const chunk = await withRetry(
        () => contract.queryFilter(eventName, start, end),
        `Sync/${eventName} ${start}-${end}`
      )
      events.push(...chunk)
      if (chunk.length > 0) {
        console.log(`[${ts()}] [Sync][${eventName}] blocks ${start}–${end}: ${chunk.length} event(s)`)
      }
    } catch (err) {
      console.warn(`[${ts()}] [Sync][${eventName}] chunk ${start}–${end} failed after retries: ${err.message}`)
    }
  }
  return events
}

// ── syncHistoricalEvents ─────────────────────────────────────────────────────

// Batch size and inter-batch delay for on-chain offers() reads.
// Keeps per-second RPC call count well under public node rate limits.
const OFFER_BATCH_SIZE  = 5
const OFFER_BATCH_DELAY = 400 // ms between batches

async function syncHistoricalEvents(contract) {
  console.log(`\n[${ts()}] [Sync] ── Historical event sync starting (from block ${DEPLOY_BLOCK}) ──`)

  // 1. OfferCreated
  const created = await queryAllEvents(contract, 'OfferCreated', DEPLOY_BLOCK)
  console.log(`[${ts()}] [Sync] OfferCreated total: ${created.length}`)

  // 2. OfferMatched — precompute cumulative matched liability per offer
  const matched = await queryAllEvents(contract, 'OfferMatched', DEPLOY_BLOCK)
  const totalMatchedByOffer = {}
  for (const ev of matched) {
    const id = Number(ev.args.offerId)
    totalMatchedByOffer[id] = (totalMatchedByOffer[id] ?? BigInt(0)) + BigInt(ev.args.placerLiability)
  }

  // 3. Upsert each order in batches (avoid RPC rate limit on offers() reads)
  for (let i = 0; i < created.length; i += OFFER_BATCH_SIZE) {
    const batch = created.slice(i, i + OFFER_BATCH_SIZE)

    await Promise.all(batch.map(async (ev) => {
      const { offerId, placer, eventId, outcome, odds, liability } = ev.args
      const id = Number(offerId)

      const computedRemaining = BigInt(liability) - (totalMatchedByOffer[id] ?? BigInt(0))
      let onChainActive    = computedRemaining > BigInt(0)
      let onChainRemaining = computedRemaining.toString()

      try {
        const onChain = await contract.offers(id)
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

      await Event.findOneAndUpdate({ eventId }, { eventId }, { upsert: true, setDefaultsOnInsert: true })
    }))

    // Throttle between batches to stay under rate limits
    if (i + OFFER_BATCH_SIZE < created.length) await sleep(OFFER_BATCH_DELAY)
  }

  // 4. EventResolved
  const resolved = await queryAllEvents(contract, 'EventResolved', DEPLOY_BLOCK)
  for (const ev of resolved) {
    const { eventId, winningOutcome } = ev.args
    await Event.findOneAndUpdate(
      { eventId },
      { eventId, resolved: true, winningOutcome: Number(winningOutcome), resolvedAt: new Date() },
      { upsert: true }
    )
    await Order.updateMany({ eventId }, { active: false })
  }

  console.log(
    `[${ts()}] [Sync] ── Done: ${created.length} offers synced, ` +
    `${matched.length} matches applied, ${resolved.length} events resolved ──\n`
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
      console.log(`[${ts()}] [OfferCreated] offerId=${offerId} eventId=${eventId}`)
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
      io?.emit('offer:matched', { matchId: Number(matchId), offerId: id, bettor })
      console.log(`[${ts()}] [OfferMatched] matchId=${matchId} offerId=${offerId}`)
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
