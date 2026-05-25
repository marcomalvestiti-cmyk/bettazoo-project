const express = require('express');
const router = express.Router();
const Referral = require('../models/Referral');

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

// POST /api/social/referral
// Records that a bettor accepted an offer after clicking a placer's share link.
router.post('/referral', async (req, res, next) => {
  const { placer, bettor, offerId, eventId } = req.body;
  if (!placer || !bettor || offerId === undefined || !eventId) {
    return res.status(400).json({ error: 'placer, bettor, offerId, eventId required' });
  }
  const placerAddr = placer.toLowerCase();
  const bettorAddr = bettor.toLowerCase();
  if (placerAddr === bettorAddr) {
    return res.json({ ok: false, reason: 'self-referral ignored' });
  }
  try {
    await Referral.findOneAndUpdate(
      { placer: placerAddr, bettor: bettorAddr, offerId: Number(offerId) },
      { eventId },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (err) {
    if (isDbOffline(err)) {
      console.warn('[social] DB unavailable, referral not saved:', err.message);
      return res.json({ ok: false, _offline: true });
    }
    next(err);
  }
});

// GET /api/social/challengers/:placerAddress
// Returns count of unique bettors who bet on this placer's offers via share link.
router.get('/challengers/:placerAddress', async (req, res, next) => {
  const placer = req.params.placerAddress.toLowerCase();
  try {
    const challengers = await Referral.distinct('bettor', { placer });
    res.json({ placer, uniqueChallengers: challengers.length, challengers });
  } catch (err) {
    if (isDbOffline(err)) {
      console.warn('[social] DB unavailable, returning 0 challengers:', err.message);
      return res.json({ placer, uniqueChallengers: 0, challengers: [], _offline: true });
    }
    next(err);
  }
});

module.exports = router;
