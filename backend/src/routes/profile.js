const express = require('express');
const router = express.Router();
const User = require('../models/User');

const EMPTY_SPEC = { category: '', sport: '', league: '' };

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

// GET /api/profile/:address
router.get('/:address', async (req, res, next) => {
  const address = req.params.address.toLowerCase();
  try {
    const user = await User.findOne({ address }).lean();
    if (!user) return res.json({ address, nickname: '', bio: '', specialization: EMPTY_SPEC });
    res.json({
      address:        user.address,
      nickname:       user.nickname,
      bio:            user.bio,
      specialization: user.specialization ?? EMPTY_SPEC,
    });
  } catch (err) {
    if (isDbOffline(err)) {
      console.warn('[profile GET] DB unavailable, returning empty profile:', err.message);
      return res.json({ address, nickname: '', bio: '', specialization: EMPTY_SPEC, _offline: true });
    }
    next(err);
  }
});

// PUT /api/profile/:address
router.put('/:address', async (req, res, next) => {
  const address = req.params.address.toLowerCase();
  const { nickname = '', bio = '', specialization } = req.body;

  if (typeof nickname !== 'string' || nickname.length > 30)
    return res.status(400).json({ error: 'nickname max 30 chars' });
  if (typeof bio !== 'string' || bio.length > 200)
    return res.status(400).json({ error: 'bio max 200 chars' });

  const $set = { nickname: nickname.trim(), bio: bio.trim() };
  if (specialization && typeof specialization === 'object') {
    $set['specialization.category'] = String(specialization.category ?? '');
    $set['specialization.sport']    = String(specialization.sport    ?? '');
    $set['specialization.league']   = String(specialization.league   ?? '');
  }

  try {
    const user = await User.findOneAndUpdate(
      { address },
      { $set },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({
      address:        user.address,
      nickname:       user.nickname,
      bio:            user.bio,
      specialization: user.specialization ?? EMPTY_SPEC,
    });
  } catch (err) {
    if (isDbOffline(err)) {
      console.warn('[profile PUT] DB unavailable, cannot persist profile:', err.message);
      return res.status(503).json({
        error: 'Database offline — profile not saved. Start MongoDB to enable persistence.',
        _offline: true,
      });
    }
    next(err);
  }
});

module.exports = router;
