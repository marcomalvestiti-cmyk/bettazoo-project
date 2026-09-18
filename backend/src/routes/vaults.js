const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const Vault = require('../models/Vault');
const Order = require('../models/Order');
const BetMatch = require('../models/BetMatch');
const { computeMaxBettorStake } = require('../utils/oddsMath');
const { AGREEMENT_VERSION, verifyAgreementSignature } = require('../services/agreement');

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

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

function buildSignMessage(ownerAddress, timestamp) {
  return `Bettazoo vault config update\nowner:${ownerAddress}\ntimestamp:${timestamp}`;
}

// Vault identity (ownerAddress -> vaultAddress) is never taken from the request body —
// it comes solely from the VaultCreated event indexed by vaultListener.js. A forged
// signature can therefore at most mis-set a vault's OWN config; it can never claim
// another owner's vault, because the recovered signer must match :ownerAddress itself.
function verifyConfigSignature(ownerAddress, signature, timestamp) {
  if (typeof signature !== 'string' || !Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > SIGNATURE_MAX_AGE_MS) return false;
  try {
    const recovered = ethers.verifyMessage(buildSignMessage(ownerAddress, timestamp), signature);
    return recovered.toLowerCase() === ownerAddress;
  } catch {
    return false;
  }
}

function serializeVault(vault) {
  return {
    exists:                true,
    ownerAddress:           vault.ownerAddress,
    vaultAddress:           vault.vaultAddress,
    keeperAddress:          vault.keeperAddress,
    onChainPaused:          vault.onChainPaused,
    status:                 vault.status,
    strategy:               vault.strategy,
    scope:                  vault.scope,
    maxExposureUsdt:        vault.maxExposureUsdt,
    perMarketExposureUsdt:  vault.perMarketExposureUsdt,
    stopLossUsdt:           vault.stopLossUsdt,
    minOdds:                vault.minOdds,
    maxOdds:                vault.maxOdds,
    liabilityIncrementUsdt: vault.liabilityIncrementUsdt,
    agreementVersion:       vault.agreementVersion ?? null,
    agreementSignedAt:      vault.agreementSignedAt ?? null,
    agreementCurrentVersion: AGREEMENT_VERSION,
    kycStatus:              vault.kycStatus ?? 'none',
    createdAtTx:            vault.createdAtTx,
    createdAtBlock:         vault.createdAtBlock,
  };
}

// GET /api/vaults/:ownerAddress
router.get('/:ownerAddress', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  try {
    const vault = await Vault.findOne({ ownerAddress }).lean();
    if (!vault) return res.json({ exists: false });
    res.json(serializeVault(vault));
  } catch (err) {
    if (isDbOffline(err)) {
      console.warn('[vaults GET] DB unavailable:', err.message);
      return res.json({ exists: false, _offline: true });
    }
    next(err);
  }
});

// PATCH /api/vaults/:ownerAddress/config
// Body: { signature, timestamp, config: { marginStrategyId?, customMargin?, scope?,
//         maxExposureUsdt?, perMarketExposureUsdt?, stopLossUsdt?, minOdds?, maxOdds?,
//         liabilityIncrementUsdt?, status? } }
// signature = ethers-signed message from buildSignMessage(ownerAddress, timestamp),
// signed by the connected wallet — see verifyConfigSignature above for what this does
// and doesn't protect against.
router.patch('/:ownerAddress/config', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  const { signature, timestamp, config } = req.body;

  if (!verifyConfigSignature(ownerAddress, signature, timestamp)) {
    return res.status(401).json({ error: 'Invalid or expired signature' });
  }
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'config object is required' });
  }

  const $set = {};
  if (config.marginStrategyId !== undefined) {
    if (!['volume', 'balanced', 'safe', 'custom'].includes(config.marginStrategyId)) {
      return res.status(400).json({ error: 'invalid marginStrategyId' });
    }
    $set['strategy.marginStrategyId'] = config.marginStrategyId;
  }
  if (config.customMargin !== undefined) $set['strategy.customMargin'] = Number(config.customMargin);
  if (config.scope !== undefined) {
    if (!Array.isArray(config.scope)) return res.status(400).json({ error: 'scope must be an array' });
    $set.scope = config.scope;
  }
  if (config.maxExposureUsdt !== undefined) $set.maxExposureUsdt = Number(config.maxExposureUsdt);
  if (config.perMarketExposureUsdt !== undefined) $set.perMarketExposureUsdt = Number(config.perMarketExposureUsdt);
  if (config.stopLossUsdt !== undefined) $set.stopLossUsdt = Number(config.stopLossUsdt);
  if (config.minOdds !== undefined) $set.minOdds = Number(config.minOdds);
  if (config.maxOdds !== undefined) $set.maxOdds = Number(config.maxOdds);
  if (config.liabilityIncrementUsdt !== undefined) $set.liabilityIncrementUsdt = Number(config.liabilityIncrementUsdt);
  if (config.status !== undefined) {
    // 'stopped' is a keeper-triggered stop-loss state — not settable through this route.
    if (!['configuring', 'active'].includes(config.status)) {
      return res.status(400).json({ error: "status must be 'configuring' or 'active'" });
    }
    $set.status = config.status;
  }
  try {
    const current = await Vault.findOne({ ownerAddress }).lean();
    if (!current) return res.status(404).json({ error: 'No vault found for this owner — create one on-chain first' });

    // Owner-initiated "please review me" — the actual approve/reject only happens
    // through the admin panel (POST /api/admin/kyc/:ownerAddress). Only moves 'none'
    // or 'rejected' to 'pending' — never downgrades an already-approved vault, so a
    // stray repeat call can never undo a real approval.
    if (config.kycRequestReview === true && ['none', 'rejected'].includes(current.kycStatus ?? 'none')) {
      $set.kycStatus = 'pending';
    }

    // Protocol-owned "Final Boss" vault (see services/keeperService.js pricing engine
    // notes) — the treasury isn't a third-party liquidity provider agreeing to supply
    // the House with funds, it IS the House's own capital, so the agreement/KYC gate
    // (built for onboarding external Placers) doesn't apply to it. Unset unless the
    // owner explicitly configures PROTOCOL_TREASURY_ADDRESS on Railway.
    const treasuryAddress = (process.env.PROTOCOL_TREASURY_ADDRESS || '').toLowerCase();
    const isProtocolVault = !!treasuryAddress && ownerAddress === treasuryAddress;

    if ($set.status === 'active' && !isProtocolVault) {
      const nextKycStatus = $set.kycStatus ?? current.kycStatus ?? 'none';
      const hasSignedAgreement = current.agreementVersion === AGREEMENT_VERSION;
      const missing = [];
      if (!hasSignedAgreement) missing.push('sign the Liquidity Provision Agreement');
      if (nextKycStatus !== 'approved') missing.push('complete KYC review');
      if (missing.length > 0) {
        return res.status(400).json({ error: `Cannot activate the vault yet — ${missing.join(' and ')} first.` });
      }
    }

    const vault = await Vault.findOneAndUpdate(
      { ownerAddress },
      { $set },
      { new: true }
    );
    if (!vault) return res.status(404).json({ error: 'No vault found for this owner — create one on-chain first' });
    res.json(serializeVault(vault));
  } catch (err) {
    if (isDbOffline(err)) {
      console.warn('[vaults PATCH] DB unavailable:', err.message);
      return res.status(503).json({ error: 'Database offline — config not saved', _offline: true });
    }
    next(err);
  }
});

// GET /api/vaults/:ownerAddress/offers
router.get('/:ownerAddress/offers', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  try {
    const vault = await Vault.findOne({ ownerAddress }).lean();
    if (!vault) return res.json({ orders: [], _offline: false });

    const filter = { placer: vault.vaultAddress };
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';

    const raw = await Order.find(filter).sort({ createdAt: -1 }).lean();
    const orders = raw.map(o => ({
      offerId:                o.offerId,
      eventId:                o.eventId,
      outcome:                o.outcome,
      odds:                   o.odds,
      oddsDecimal:            o.oddsDecimal,
      remainingLiabilityUsdt: (Number(o.remainingLiability) / 1_000_000).toFixed(6),
      maxBettorStakeUsdt:     computeMaxBettorStake(o.remainingLiability, o.odds),
      active:                 o.active,
      txHash:                 o.txHash,
    }));
    res.json({ vaultAddress: vault.vaultAddress, orders });
  } catch (err) {
    if (isDbOffline(err)) {
      console.warn('[vaults offers] DB unavailable:', err.message);
      return res.json({ orders: [], _offline: true });
    }
    next(err);
  }
});

// GET /api/vaults/:ownerAddress/pnl
router.get('/:ownerAddress/pnl', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  try {
    const vault = await Vault.findOne({ ownerAddress }).lean();
    if (!vault) return res.json({ realizedPnlUsdt: 0, matchesSettled: 0 });

    const matches = await BetMatch.find({ placer: vault.vaultAddress, settled: true }).lean();
    let realizedPnlUsdt = 0;
    for (const m of matches) {
      const bettorWon = m.settledOutcome === m.outcome;
      realizedPnlUsdt += bettorWon
        ? -(Number(m.placerLiability) / 1_000_000)
        : (Number(m.bettorStake) / 1_000_000);
    }

    res.json({
      vaultAddress:      vault.vaultAddress,
      realizedPnlUsdt:   +realizedPnlUsdt.toFixed(6),
      matchesSettled:    matches.length,
      stopLossUsdt:      vault.stopLossUsdt,
      stopLossTriggered: vault.status === 'stopped',
    });
  } catch (err) {
    if (isDbOffline(err)) {
      console.warn('[vaults pnl] DB unavailable:', err.message);
      return res.json({ realizedPnlUsdt: 0, matchesSettled: 0, _offline: true });
    }
    next(err);
  }
});

// POST /api/vaults/:ownerAddress/agreement
// Body: { signature, timestamp }
// EIP-712 signature over the current Liquidity Provision Agreement (see
// services/agreement.js) — a separate route from PATCH /config because it's a
// different signing scheme (typed data, not a plain personal_sign message) and a
// distinct, one-time action rather than a config field.
router.post('/:ownerAddress/agreement', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  const { signature, timestamp } = req.body;

  if (!verifyAgreementSignature(ownerAddress, signature, timestamp)) {
    return res.status(401).json({ error: 'Invalid or expired agreement signature' });
  }

  try {
    const vault = await Vault.findOneAndUpdate(
      { ownerAddress },
      { $set: { agreementVersion: AGREEMENT_VERSION, agreementSignature: signature, agreementSignedAt: new Date() } },
      { new: true }
    );
    if (!vault) return res.status(404).json({ error: 'No vault found for this owner — create one on-chain first' });
    res.json(serializeVault(vault));
  } catch (err) {
    if (isDbOffline(err)) {
      console.warn('[vaults agreement] DB unavailable:', err.message);
      return res.status(503).json({ error: 'Database offline — agreement not saved', _offline: true });
    }
    next(err);
  }
});

module.exports = router;
module.exports.buildSignMessage = buildSignMessage; // exported for tests
