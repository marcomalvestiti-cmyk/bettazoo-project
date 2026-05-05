const express = require('express');
const router = express.Router();
const { resolveEventOnChain, simulateResult } = require('../services/oracleMock');
const Event = require('../models/Event');

// POST /api/oracle/resolve
// Body: { eventId, winningOutcome, rpcUrl?, contractAddress?, privateKey? }
router.post('/resolve', async (req, res, next) => {
  try {
    const {
      eventId,
      winningOutcome,
      rpcUrl        = process.env.RPC_URL,
      contractAddress = process.env.CONTRACT_ADDRESS,
      privateKey    = process.env.ORACLE_PRIVATE_KEY,
    } = req.body;

    if (eventId === undefined || winningOutcome === undefined) {
      return res.status(400).json({ error: 'eventId and winningOutcome are required' });
    }
    if (!rpcUrl || !contractAddress || !privateKey) {
      return res.status(400).json({ error: 'RPC_URL, CONTRACT_ADDRESS and ORACLE_PRIVATE_KEY must be set' });
    }

    const receipt = await resolveEventOnChain({ rpcUrl, contractAddress, privateKey, eventId, winningOutcome });
    res.json({ success: true, eventId, winningOutcome, ...receipt });
  } catch (err) {
    next(err);
  }
});

// GET /api/oracle/simulate/:eventId  — picks a random outcome and returns it (does NOT call on-chain)
router.get('/simulate/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const result = simulateResult(eventId);

    const ev = await Event.findOne({ eventId }).lean();
    res.json({ ...result, eventName: ev?.name || null, teams: ev?.teams || [] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
