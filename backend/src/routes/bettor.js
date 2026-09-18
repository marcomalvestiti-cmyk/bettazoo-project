const express = require('express');
const router = express.Router();
const BetMatch = require('../models/BetMatch');

function isDbOffline(err) {
  const msg = err?.message ?? '';
  return (
    msg.includes('bufferCommands') ||
    msg.includes('before initial connection') ||
    err?.name === 'MongoNotConnectedError' ||
    err?.name === 'MongoNetworkError' ||
    err?.name === 'MongoServerSelectionError'
  );
}

// GET /api/bettor/:address/bets — a bettor's bet history, derived entirely from
// on-chain OfferMatched/EventResolved events (see BetMatch.js, populated by
// web3Listener.js) rather than the browser's own localStorage. The old approach
// (lib/betHistory.ts, now removed) meant "My Bets" was empty on any device/browser
// other than the one the bet was placed from — this is the single source of truth
// instead, the same shift already made for the Placer side's offers in Phase 3.
router.get('/:address/bets', async (req, res, next) => {
  const bettor = req.params.address.toLowerCase();
  try {
    const matches = await BetMatch.find({ bettor }).sort({ createdAt: -1 }).limit(200).lean();
    const bets = matches.map((m) => ({
      matchId:        m.matchId,
      offerId:        m.offerId,
      eventId:        m.eventId,
      outcome:        m.outcome,
      oddsDecimal:    m.odds / 10000,
      stakeUsdt:      Number(m.bettorStake) / 1_000_000,
      placedAt:       m.createdAt,
      settled:        m.settled,
      settledOutcome: m.settledOutcome,
    }));
    res.json({ bets });
  } catch (err) {
    if (isDbOffline(err)) return res.json({ bets: [], _offline: true });
    next(err);
  }
});

module.exports = router;
