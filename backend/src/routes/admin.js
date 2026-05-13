const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { syncHistoricalEvents } = require('../services/web3Listener');
const { ethers } = require('ethers');

// POST /api/admin/resync
// Triggers a full historical event replay from ESCROW_DEPLOY_BLOCK.
// Call this manually after any backend restart to recover missed events.
router.post('/resync', async (req, res) => {
  const rpcUrl          = process.env.RPC_URL;
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    return res.status(503).json({
      error: 'RPC_URL or CONTRACT_ADDRESS not configured — resync unavailable',
    });
  }

  try {
    const provider = (rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://'))
      ? new ethers.WebSocketProvider(rpcUrl)
      : new ethers.JsonRpcProvider(rpcUrl);

    const ESCROW_ABI = [
      'event OfferCreated(uint256 indexed offerId, address indexed placer, string eventId, uint8 outcome, uint256 odds, uint256 liability)',
      'event OfferMatched(uint256 indexed matchId, uint256 indexed offerId, address indexed bettor, uint256 bettorStake, uint256 placerLiability)',
      'event EventResolved(string eventId, uint8 winningOutcome)',
      'function offers(uint256 offerId) view returns (uint256 id, address placer, string eventId, uint8 outcome, uint256 odds, uint256 liability, uint256 remainingLiability, bool active)',
    ];
    const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);

    // Run async — respond immediately so the HTTP request doesn't time out
    syncHistoricalEvents(contract).catch(err =>
      console.error('[resync] background sync failed:', err.message)
    );

    const count = await Order.countDocuments({});
    res.json({ ok: true, message: 'Historical sync started in background', currentOrderCount: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/status — quick DB health check
router.get('/status', async (req, res) => {
  try {
    const total  = await Order.countDocuments({});
    const active = await Order.countDocuments({ active: true });
    res.json({
      ok: true,
      orders: { total, active, inactive: total - active },
      rpcConfigured:      !!process.env.RPC_URL,
      contractConfigured: !!process.env.CONTRACT_ADDRESS,
      deployBlock:        parseInt(process.env.ESCROW_DEPLOY_BLOCK ?? '0'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
