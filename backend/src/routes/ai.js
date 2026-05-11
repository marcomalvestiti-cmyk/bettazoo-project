const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { suggestOdds, analyzeRisk } = require('../services/aiService');

// POST /api/ai/suggest-odds
// Body: { eventId, eventName?, sport?, teams?, outcome?, currentMarketOdds?, placerExposureUsdt?, margin? }
router.post('/suggest-odds', async (req, res, next) => {
  try {
    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ error: 'eventId is required' });

    // suggestOdds is pure computation — no DB needed, always works
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

    let orders = [];
    try {
      orders = await Order.find({ placer: placerAddress, active: true }).lean();
    } catch (dbErr) {
      console.warn('[risk-manager] DB unavailable, returning demo risk data:', dbErr.message);
      return res.json({
        placerAddress,
        level: 'LOW',
        totalExposureUsdt: 0,
        message: 'Risk Manager running in demo mode — connect MongoDB for live exposure tracking.',
        exposures: [],
        recommendations: [
          'Start MongoDB to see real-time exposure data',
          'Create offers via the Hardhat node to populate the order book',
        ],
        _offline: true,
      });
    }

    const analysis = analyzeRisk(orders);
    res.json({ placerAddress, ...analysis });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
