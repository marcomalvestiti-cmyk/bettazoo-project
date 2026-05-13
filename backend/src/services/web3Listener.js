const { ethers } = require('ethers');
const Order = require('../models/Order');
const Event = require('../models/Event');

const ESCROW_ABI = [
  'event OfferCreated(uint256 indexed offerId, address indexed placer, string eventId, uint8 outcome, uint256 odds, uint256 liability)',
  'event OfferMatched(uint256 indexed matchId, uint256 indexed offerId, address indexed bettor, uint256 bettorStake, uint256 placerLiability)',
  'event EventResolved(string eventId, uint8 winningOutcome)',
  'event WinningsPaid(address indexed winner, uint256 amount)',
  // View function to read authoritative on-chain offer state (catches cancellations)
  'function offers(uint256 offerId) view returns (uint256 id, address placer, string eventId, uint8 outcome, uint256 odds, uint256 liability, uint256 remainingLiability, bool active)',
];

const DEPLOY_BLOCK = parseInt(process.env.ESCROW_DEPLOY_BLOCK ?? '0');
// Most public RPCs (Alchemy, Arbitrum public) cap eth_getLogs to 10 000 blocks.
const CHUNK_SIZE = 9_000;

// Paginated queryFilter: handles RPC block-range limits automatically.
async function queryAllEvents(contract, eventName, fromBlock) {
  let toBlock;
  try {
    toBlock = await contract.runner.provider.getBlockNumber();
  } catch {
    // If we can't get the block number, fall back to a single un-chunked query.
    console.warn(`[Sync] Could not get block number — trying single queryFilter for ${eventName}`);
    return contract.queryFilter(eventName, fromBlock, 'latest');
  }

  if (fromBlock > toBlock) return [];

  const totalBlocks = toBlock - fromBlock;
  if (totalBlocks > 500_000) {
    console.warn(
      `[Sync] Block range is very large (${totalBlocks} blocks). ` +
      `Set ESCROW_DEPLOY_BLOCK in your env to the contract deploy block to speed this up.`
    );
  }

  const events = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
    try {
      const chunk = await contract.queryFilter(eventName, start, end);
      events.push(...chunk);
      if (chunk.length > 0) {
        console.log(`[Sync][${eventName}] blocks ${start}-${end}: ${chunk.length} event(s)`);
      }
    } catch (err) {
      console.warn(`[Sync][${eventName}] chunk ${start}-${end} failed: ${err.message}`);
    }
  }
  return events;
}

// Reads every historical OfferCreated / OfferMatched / EventResolved event and
// upserts the DB so the orderbook is accurate even after a backend restart.
async function syncHistoricalEvents(contract) {
  console.log(`\n[Sync] ── Historical event sync starting (from block ${DEPLOY_BLOCK}) ──`);

  // 1. Fetch all OfferCreated events
  const created = await queryAllEvents(contract, 'OfferCreated', DEPLOY_BLOCK);
  console.log(`[Sync] OfferCreated total: ${created.length}`);

  // 2. Fetch all OfferMatched events and precompute cumulative matched liability per offer
  const matched = await queryAllEvents(contract, 'OfferMatched', DEPLOY_BLOCK);
  const totalMatchedByOffer = {};
  for (const ev of matched) {
    const id = Number(ev.args.offerId);
    totalMatchedByOffer[id] = (totalMatchedByOffer[id] ?? BigInt(0)) + BigInt(ev.args.placerLiability);
  }

  // 3. Upsert each order, reading on-chain state for authoritative active/remaining
  //    (this is the only way to detect cancellations — contract has no OfferCancelled event)
  for (const ev of created) {
    const { offerId, placer, eventId, outcome, odds, liability } = ev.args;
    const id = Number(offerId);

    const computedRemaining = BigInt(liability) - (totalMatchedByOffer[id] ?? BigInt(0));
    let onChainActive   = computedRemaining > BigInt(0);
    let onChainRemaining = computedRemaining.toString();

    try {
      const onChain = await contract.offers(id);
      onChainActive    = onChain.active;
      onChainRemaining = onChain.remainingLiability.toString();
    } catch (err) {
      console.warn(`[Sync] on-chain read for offer #${id} failed (using computed): ${err.message}`);
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
    );

    await Event.findOneAndUpdate({ eventId }, { eventId }, { upsert: true, setDefaultsOnInsert: true });
  }

  // 4. Handle EventResolved
  const resolved = await queryAllEvents(contract, 'EventResolved', DEPLOY_BLOCK);
  for (const ev of resolved) {
    const { eventId, winningOutcome } = ev.args;
    await Event.findOneAndUpdate(
      { eventId },
      { eventId, resolved: true, winningOutcome: Number(winningOutcome), resolvedAt: new Date() },
      { upsert: true }
    );
    await Order.updateMany({ eventId }, { active: false });
  }

  console.log(
    `[Sync] ── Done: ${created.length} offers synced, ` +
    `${matched.length} matches applied, ${resolved.length} events resolved ──\n`
  );
}

async function startListener(provider, contractAddress, io) {
  const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);
  console.log(`[Web3] Listener starting on contract ${contractAddress}`);

  // Replay all historical events before subscribing to new ones
  await syncHistoricalEvents(contract);

  // ── Real-time subscriptions ──────────────────────────────────────────────────

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
      );
      await Event.findOneAndUpdate({ eventId }, { eventId }, { upsert: true, setDefaultsOnInsert: true });
      io?.emit('offer:created', { offerId: Number(offerId), placer, eventId, outcome: Number(outcome) });
      console.log(`[OfferCreated] offerId=${offerId} eventId=${eventId}`);
    } catch (err) {
      console.error('[OfferCreated] error:', err.message);
    }
  });

  contract.on('OfferMatched', async (matchId, offerId, bettor, bettorStake, placerLiability, ev) => {
    try {
      const id = Number(offerId);
      // Read on-chain for authoritative remaining (also catches partial fills)
      let onChainActive = true, onChainRemaining = '0';
      try {
        const onChain = await contract.offers(id);
        onChainActive    = onChain.active;
        onChainRemaining = onChain.remainingLiability.toString();
      } catch {
        const order = await Order.findOne({ offerId: id });
        if (order) {
          const newRemaining  = BigInt(order.remainingLiability) - BigInt(placerLiability);
          onChainRemaining    = newRemaining.toString();
          onChainActive       = newRemaining > BigInt(0);
        }
      }
      await Order.findOneAndUpdate(
        { offerId: id },
        { remainingLiability: onChainRemaining, active: onChainActive }
      );
      io?.emit('offer:matched', { matchId: Number(matchId), offerId: id, bettor });
      console.log(`[OfferMatched] matchId=${matchId} offerId=${offerId}`);
    } catch (err) {
      console.error('[OfferMatched] error:', err.message);
    }
  });

  contract.on('EventResolved', async (eventId, winningOutcome) => {
    try {
      await Event.findOneAndUpdate(
        { eventId },
        { resolved: true, winningOutcome: Number(winningOutcome), resolvedAt: new Date() }
      );
      await Order.updateMany({ eventId }, { active: false });
      io?.emit('event:resolved', { eventId, winningOutcome: Number(winningOutcome) });
      console.log(`[EventResolved] eventId=${eventId} winningOutcome=${winningOutcome}`);
    } catch (err) {
      console.error('[EventResolved] error:', err.message);
    }
  });

  provider.on?.('error', (err) => {
    console.error('[Web3] Provider error:', err.message);
  });

  console.log('[Web3] Real-time subscriptions active.');
}

module.exports = { startListener, syncHistoricalEvents };
