const { ethers } = require('ethers');
const Order = require('../models/Order');
const Event = require('../models/Event');

const ESCROW_ABI = [
  'event OfferCreated(uint256 indexed offerId, address indexed placer, string eventId, uint8 outcome, uint256 odds, uint256 liability)',
  'event OfferMatched(uint256 indexed matchId, uint256 indexed offerId, address indexed bettor, uint256 bettorStake, uint256 placerLiability)',
  'event EventResolved(string eventId, uint8 winningOutcome)',
  'event WinningsPaid(address indexed winner, uint256 amount)',
];

async function startListener(provider, contractAddress, io) {
  const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);
  console.log(`Web3 listener started on contract ${contractAddress}`);

  contract.on('OfferCreated', async (offerId, placer, eventId, outcome, odds, liability, ev) => {
    try {
      await Order.findOneAndUpdate(
        { offerId: Number(offerId) },
        {
          offerId: Number(offerId),
          placer: placer.toLowerCase(),
          eventId,
          outcome: Number(outcome),
          odds: Number(odds),
          oddsDecimal: Number(odds) / 10000,
          liability: liability.toString(),
          remainingLiability: liability.toString(),
          active: true,
          txHash: ev.log.transactionHash,
          blockNumber: ev.log.blockNumber,
        },
        { upsert: true, new: true }
      );

      await Event.findOneAndUpdate(
        { eventId },
        { eventId },
        { upsert: true, setDefaultsOnInsert: true }
      );

      io?.emit('offer:created', { offerId: Number(offerId), placer, eventId, outcome: Number(outcome), odds: Number(odds) });
      console.log(`[OfferCreated] offerId=${offerId} eventId=${eventId}`);
    } catch (err) {
      console.error('[OfferCreated] error:', err.message);
    }
  });

  contract.on('OfferMatched', async (matchId, offerId, bettor, bettorStake, placerLiability, ev) => {
    try {
      const order = await Order.findOne({ offerId: Number(offerId) });
      if (order) {
        const newRemaining = BigInt(order.remainingLiability) - BigInt(placerLiability);
        order.remainingLiability = newRemaining.toString();
        if (newRemaining === 0n) order.active = false;
        await order.save();
      }

      io?.emit('offer:matched', { matchId: Number(matchId), offerId: Number(offerId), bettor, bettorStake: bettorStake.toString() });
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

  provider.on('error', (err) => {
    console.error('Provider error:', err.message);
  });
}

module.exports = { startListener };
