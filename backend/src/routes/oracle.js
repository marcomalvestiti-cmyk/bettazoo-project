const express = require('express');
const router = express.Router();
const { resolveEventOnChain, simulateResult } = require('../services/oracleMock');
const Event = require('../models/Event');

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

const OUTCOMES = { 0: 'Home Win', 1: 'Draw', 2: 'Away Win' };

// GET /api/oracle/events — list all events with resolution status (for admin panel)
router.get('/events', async (req, res, next) => {
  try {
    const events = await Event.find({}).lean();
    res.json({ events });
  } catch (err) {
    if (isDbOffline(err)) return res.json({ events: [], _offline: true });
    next(err);
  }
});

// POST /api/oracle/resolve — DB-first; on-chain only if contract credentials are configured
router.post('/resolve', async (req, res, next) => {
  const {
    eventId,
    winningOutcome,
    rpcUrl          = process.env.RPC_URL,
    contractAddress = process.env.CONTRACT_ADDRESS,
    privateKey      = process.env.ORACLE_PRIVATE_KEY,
  } = req.body;

  if (eventId === undefined || winningOutcome === undefined) {
    return res.status(400).json({ error: 'eventId and winningOutcome are required' });
  }

  // Always persist resolution to DB
  try {
    await Event.findOneAndUpdate(
      { eventId },
      { $set: { resolved: true, winningOutcome: Number(winningOutcome), resolvedAt: new Date() } },
      { upsert: true, new: true }
    );
  } catch (dbErr) {
    if (!isDbOffline(dbErr)) return next(dbErr);
    console.warn('[oracle resolve] DB unavailable — resolution not persisted');
  }

  // On-chain resolution only if all credentials present (Mainnet / Testnet mode)
  if (rpcUrl && contractAddress && privateKey) {
    try {
      const receipt = await resolveEventOnChain({ rpcUrl, contractAddress, privateKey, eventId, winningOutcome });
      return res.json({
        success: true, eventId,
        winningOutcome: Number(winningOutcome),
        outcome: OUTCOMES[winningOutcome] ?? 'Unknown',
        onChain: true,
        ...receipt,
      });
    } catch (err) {
      return res.status(500).json({ error: `On-chain resolution failed: ${err.message}` });
    }
  }

  // DB-only mode — Alpha Test without deployed contract
  res.json({
    success: true,
    eventId,
    winningOutcome: Number(winningOutcome),
    outcome: OUTCOMES[winningOutcome] ?? 'Unknown',
    onChain: false,
    dbOnly: true,
  });
});

// GET /api/oracle/simulate/:eventId — random outcome, does NOT call on-chain
router.get('/simulate/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const result = simulateResult(eventId);
    const ev = await Event.findOne({ eventId }).lean();
    res.json({ ...result, eventName: ev?.name || null, teams: ev?.teams || [] });
  } catch (err) {
    if (isDbOffline(err)) {
      const result = simulateResult(req.params.eventId);
      return res.json({ ...result, eventName: null, teams: [] });
    }
    next(err);
  }
});

module.exports = router;
