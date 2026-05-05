const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { suggestOdds, analyzeRisk } = require('../services/aiService');

// POST /api/ai/suggest-odds
// Body: { eventId, eventName?, sport?, teams?, outcome?, currentMarketOdds?, placerExposureUsdt? }
router.post('/suggest-odds', async (req, res, next) => {
  try {
    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ error: 'eventId is required' });

    const result = await suggestOdds(req.body);
    res.json({ eventId, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/risk-manager/:placerAddress
router.get('/risk-manager/:placerAddress', async (req, res, next) => {
  try {
    const placerAddress = req.params.placerAddress.toLowerCase();
    const orders = await Order.find({ placer: placerAddress, active: true }).lean();
    const analysis = analyzeRisk(orders);
    res.json({ placerAddress, ...analysis });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
