const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Vault = require('../models/Vault');
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

// GET /api/admin/kyc — every vault with a KYC-relevant status, pending first.
// No Sumsub integration yet (testnet) — this is the manual stand-in for it, proving
// out the enforcement point (see models/Vault.js, keeperService.js) ahead of wiring
// a real verification provider pre-mainnet. Same no-auth posture as the rest of
// /api/admin and /admin/resolver: testnet-only, not linked from the main nav.
router.get('/kyc', async (req, res, next) => {
  try {
    const vaults = await Vault.find({}).sort({ createdAt: -1 }).lean();
    const order = { pending: 0, none: 1, rejected: 2, approved: 3 };
    const rows = vaults
      .map(v => ({
        ownerAddress:      v.ownerAddress,
        vaultAddress:      v.vaultAddress,
        status:            v.status,
        kycStatus:         v.kycStatus ?? 'none',
        agreementVersion:  v.agreementVersion ?? null,
        agreementSignedAt: v.agreementSignedAt ?? null,
        createdAt:         v.createdAt,
      }))
      .sort((a, b) => (order[a.kycStatus] ?? 9) - (order[b.kycStatus] ?? 9));
    res.json({ vaults: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/kyc/:ownerAddress — { status: 'approved' | 'rejected' | 'none' }
router.post('/kyc/:ownerAddress', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  const { status } = req.body;
  if (!['approved', 'rejected', 'none'].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved', 'rejected' or 'none'" });
  }
  try {
    const vault = await Vault.findOneAndUpdate({ ownerAddress }, { $set: { kycStatus: status } }, { new: true });
    if (!vault) return res.status(404).json({ error: 'No vault found for this owner' });
    res.json({ ownerAddress: vault.ownerAddress, kycStatus: vault.kycStatus });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
