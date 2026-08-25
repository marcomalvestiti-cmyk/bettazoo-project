const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { computeMaxBettorStake } = require('../utils/oddsMath');

function buildSummary(orders) {
  const summary = {};
  for (const o of orders) {
    const key = String(o.outcome);
    if (!summary[key]) summary[key] = { outcome: o.outcome, count: 0, totalLiquidityUsdt: 0 };
    summary[key].count++;
    summary[key].totalLiquidityUsdt += Number(o.remainingLiability) / 1_000_000;
  }
  for (const key of Object.keys(summary)) {
    summary[key].totalLiquidityUsdt = +summary[key].totalLiquidityUsdt.toFixed(6);
    summary[key].bestOdds = Math.max(
      ...orders.filter(o => String(o.outcome) === key).map(o => o.oddsDecimal)
    );
  }
  return summary;
}

// GET /api/orderbook/:eventId[?outcome=0]
router.get('/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const filter = { eventId, active: true };
    if (req.query.outcome !== undefined) filter.outcome = Number(req.query.outcome);

    let raw = [];
    try {
      raw = await Order.find(filter).sort({ odds: -1 }).lean();
    } catch (dbErr) {
      console.warn('[orderbook] DB unavailable, returning empty orderbook:', dbErr.message);
      return res.json({ eventId, orders: [], summary: {}, _offline: true });
    }

    console.log(`[orderbook] eventId=${eventId} filter=${JSON.stringify(filter)} → ${raw.length} orders`);

    const orders = raw.map(o => ({
      offerId:               o.offerId,
      placer:                o.placer,
      eventId:               o.eventId,
      outcome:               o.outcome,
      odds:                  o.odds,
      oddsDecimal:           o.oddsDecimal,
      remainingLiabilityUsdt: (Number(o.remainingLiability) / 1_000_000).toFixed(6),
      maxBettorStakeUsdt:    computeMaxBettorStake(o.remainingLiability, o.odds),
      txHash:                o.txHash,
    }));

    res.json({ eventId, orders, summary: buildSummary(raw) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
