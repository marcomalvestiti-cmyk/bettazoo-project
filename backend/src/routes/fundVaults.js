const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const FundVault = require('../models/FundVault');
const FundVaultLP = require('../models/FundVaultLP');
const { AGREEMENT_VERSION, verifyAgreementSignature } = require('../services/agreement');
const { FUND_AGREEMENT_VERSION, verifyFundAgreementSignature } = require('../services/fundAgreement');

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

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

// Deliberately different message text from routes/vaults.js's buildSignMessage — a
// signature for one must never satisfy the other, even though both are owner-signed
// plain messages over the same wallet.
function buildFundVaultSignMessage(ownerAddress, timestamp) {
  return `Bettazoo fund vault config update\nowner:${ownerAddress}\ntimestamp:${timestamp}`;
}

function verifyConfigSignature(ownerAddress, signature, timestamp) {
  if (typeof signature !== 'string' || !Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > SIGNATURE_MAX_AGE_MS) return false;
  try {
    const recovered = ethers.verifyMessage(buildFundVaultSignMessage(ownerAddress, timestamp), signature);
    return recovered.toLowerCase() === ownerAddress;
  } catch {
    return false;
  }
}

function serializeFundVault(vault) {
  return {
    exists:                  true,
    ownerAddress:             vault.ownerAddress,
    fundVaultAddress:         vault.fundVaultAddress,
    keeperAddress:            vault.keeperAddress,
    onChainPaused:            vault.onChainPaused,
    status:                   vault.status,
    strategy:                 vault.strategy,
    scope:                    vault.scope,
    maxExposureUsdt:          vault.maxExposureUsdt,
    perMarketExposureUsdt:    vault.perMarketExposureUsdt,
    stopLossUsdt:             vault.stopLossUsdt,
    minOdds:                  vault.minOdds,
    maxOdds:                  vault.maxOdds,
    liabilityIncrementUsdt:   vault.liabilityIncrementUsdt,
    agreementVersion:         vault.agreementVersion ?? null,
    agreementSignedAt:        vault.agreementSignedAt ?? null,
    agreementCurrentVersion:  AGREEMENT_VERSION,
    kycStatus:                vault.kycStatus ?? 'none',
    createdAtTx:              vault.createdAtTx,
    createdAtBlock:           vault.createdAtBlock,
  };
}

// GET /api/fund-vaults/:ownerAddress
router.get('/:ownerAddress', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  try {
    const vault = await FundVault.findOne({ ownerAddress }).lean();
    if (!vault) return res.json({ exists: false });
    res.json(serializeFundVault(vault));
  } catch (err) {
    if (isDbOffline(err)) return res.json({ exists: false, _offline: true });
    next(err);
  }
});

// PATCH /api/fund-vaults/:ownerAddress/config
// Same shape/semantics as PATCH /api/vaults/:ownerAddress/config (routes/vaults.js) —
// signed plain-message update, status:'active' gated on the MANAGER's own agreement +
// KYC (never the LPs' — LP compliance only gates their own on-chain approvedLPs entry,
// set separately by the manager, see POST .../lp/:lpAddress/agreement below).
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
    if (!['configuring', 'active'].includes(config.status)) {
      return res.status(400).json({ error: "status must be 'configuring' or 'active'" });
    }
    $set.status = config.status;
  }

  try {
    const current = await FundVault.findOne({ ownerAddress }).lean();
    if (!current) return res.status(404).json({ error: 'No fund vault found for this owner — create one on-chain first' });

    if (config.kycRequestReview === true && ['none', 'rejected'].includes(current.kycStatus ?? 'none')) {
      $set.kycStatus = 'pending';
      $set.kycRequestedAt = new Date();
    }

    if ($set.status === 'active') {
      const nextKycStatus = $set.kycStatus ?? current.kycStatus ?? 'none';
      const hasSignedAgreement = current.agreementVersion === AGREEMENT_VERSION;
      const missing = [];
      if (!hasSignedAgreement) missing.push('sign the Liquidity Provision Agreement');
      if (nextKycStatus !== 'approved') missing.push('complete KYC review');
      if (missing.length > 0) {
        return res.status(400).json({ error: `Cannot activate the fund vault yet — ${missing.join(' and ')} first.` });
      }
    }

    const vault = await FundVault.findOneAndUpdate({ ownerAddress }, { $set }, { new: true });
    if (!vault) return res.status(404).json({ error: 'No fund vault found for this owner — create one on-chain first' });
    res.json(serializeFundVault(vault));
  } catch (err) {
    if (isDbOffline(err)) return res.status(503).json({ error: 'Database offline — config not saved', _offline: true });
    next(err);
  }
});

// POST /api/fund-vaults/:ownerAddress/agreement — manager-side, reuses the same
// "Liquidity Provision Agreement" as the single-owner Vault (see routes/vaults.js).
router.post('/:ownerAddress/agreement', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  const { signature, timestamp } = req.body;

  if (!verifyAgreementSignature(ownerAddress, signature, timestamp)) {
    return res.status(401).json({ error: 'Invalid or expired agreement signature' });
  }

  try {
    const vault = await FundVault.findOneAndUpdate(
      { ownerAddress },
      { $set: { agreementVersion: AGREEMENT_VERSION, agreementSignature: signature, agreementSignedAt: new Date() } },
      { new: true }
    );
    if (!vault) return res.status(404).json({ error: 'No fund vault found for this owner — create one on-chain first' });
    res.json(serializeFundVault(vault));
  } catch (err) {
    if (isDbOffline(err)) return res.status(503).json({ error: 'Database offline — agreement not saved', _offline: true });
    next(err);
  }
});

// GET /api/fund-vaults/:ownerAddress/lps — manager-facing allowlist/compliance view.
router.get('/:ownerAddress/lps', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  try {
    const vault = await FundVault.findOne({ ownerAddress }).lean();
    if (!vault) return res.json({ lps: [] });
    const lps = await FundVaultLP.find({ fundVaultAddress: vault.fundVaultAddress }).sort({ createdAt: -1 }).lean();
    res.json({
      fundVaultAddress: vault.fundVaultAddress,
      lps: lps.map(lp => ({
        lpAddress:         lp.lpAddress,
        approved:          lp.approved,
        kycStatus:         lp.kycStatus ?? 'none',
        agreementVersion:  lp.agreementVersion ?? null,
        agreementSignedAt: lp.agreementSignedAt ?? null,
      })),
    });
  } catch (err) {
    if (isDbOffline(err)) return res.json({ lps: [], _offline: true });
    next(err);
  }
});

// POST /api/fund-vaults/:ownerAddress/lp/:lpAddress/agreement — LP's own "Fund
// Participation Agreement" (see services/fundAgreement.js), a separate consent record
// from the manager's. Recorded regardless of current on-chain approval — the manager
// checks this (and KYC status below) before calling setApprovedLP on-chain.
router.post('/:ownerAddress/lp/:lpAddress/agreement', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  const lpAddress = req.params.lpAddress.toLowerCase();
  const { signature, timestamp } = req.body;

  try {
    const vault = await FundVault.findOne({ ownerAddress }).lean();
    if (!vault) return res.status(404).json({ error: 'No fund vault found for this owner' });

    if (!verifyFundAgreementSignature(vault.fundVaultAddress, lpAddress, signature, timestamp)) {
      return res.status(401).json({ error: 'Invalid or expired agreement signature' });
    }

    const lp = await FundVaultLP.findOneAndUpdate(
      { fundVaultAddress: vault.fundVaultAddress, lpAddress },
      {
        $set: {
          agreementVersion: FUND_AGREEMENT_VERSION,
          agreementSignature: signature,
          agreementSignedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({
      fundVaultAddress: vault.fundVaultAddress,
      lpAddress: lp.lpAddress,
      approved: lp.approved,
      kycStatus: lp.kycStatus,
      agreementVersion: lp.agreementVersion,
      agreementSignedAt: lp.agreementSignedAt,
    });
  } catch (err) {
    if (isDbOffline(err)) return res.status(503).json({ error: 'Database offline — agreement not saved', _offline: true });
    next(err);
  }
});

// POST /api/fund-vaults/:ownerAddress/lp/:lpAddress/kyc-request — LP's own "please
// review me" request, same semantics as the manager-side kycRequestReview flag in
// PATCH .../config (only moves none/rejected -> pending, never downgrades an approval).
router.post('/:ownerAddress/lp/:lpAddress/kyc-request', async (req, res, next) => {
  const ownerAddress = req.params.ownerAddress.toLowerCase();
  const lpAddress = req.params.lpAddress.toLowerCase();

  try {
    const vault = await FundVault.findOne({ ownerAddress }).lean();
    if (!vault) return res.status(404).json({ error: 'No fund vault found for this owner' });

    const current = await FundVaultLP.findOne({ fundVaultAddress: vault.fundVaultAddress, lpAddress }).lean();
    if (current && !['none', 'rejected'].includes(current.kycStatus ?? 'none')) {
      return res.json({ fundVaultAddress: vault.fundVaultAddress, lpAddress, kycStatus: current.kycStatus });
    }

    const lp = await FundVaultLP.findOneAndUpdate(
      { fundVaultAddress: vault.fundVaultAddress, lpAddress },
      { $set: { kycStatus: 'pending', kycRequestedAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ fundVaultAddress: vault.fundVaultAddress, lpAddress, kycStatus: lp.kycStatus });
  } catch (err) {
    if (isDbOffline(err)) return res.status(503).json({ error: 'Database offline — request not saved', _offline: true });
    next(err);
  }
});

module.exports = router;
module.exports.buildFundVaultSignMessage = buildFundVaultSignMessage; // exported for tests
