const express = require('express');
const router = express.Router();
const User = require('../models/User');

// GET /api/profile/:address
router.get('/:address', async (req, res, next) => {
  try {
    const address = req.params.address.toLowerCase();
    const user = await User.findOne({ address }).lean();
    if (!user) return res.json({ address, nickname: '', bio: '' });
    res.json({ address: user.address, nickname: user.nickname, bio: user.bio });
  } catch (err) {
    next(err);
  }
});

// PUT /api/profile/:address
router.put('/:address', async (req, res, next) => {
  try {
    const address = req.params.address.toLowerCase();
    const { nickname = '', bio = '' } = req.body;

    if (typeof nickname !== 'string' || nickname.length > 30)
      return res.status(400).json({ error: 'nickname max 30 caratteri' });
    if (typeof bio !== 'string' || bio.length > 200)
      return res.status(400).json({ error: 'bio max 200 caratteri' });

    const user = await User.findOneAndUpdate(
      { address },
      { $set: { nickname: nickname.trim(), bio: bio.trim() } },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ address: user.address, nickname: user.nickname, bio: user.bio });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
