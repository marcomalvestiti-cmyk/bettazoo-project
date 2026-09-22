const mongoose = require('mongoose');

// Fund vault (Tier 3, item 2/3) — ERC-4626 vault that lets a placer ("fund manager")
// raise third-party USDT capital via PlacerFundVaultFactory, separate from the
// single-owner PlacerVault (models/Vault.js) which stays untouched. Mirrors most of
// Vault.js's shape deliberately (same keeper requoting logic in keeperService.js reads
// both), but on-chain numeric state (TVL, price per share, highWaterMark,
// performanceFeePercent, approvedLPs) is read live from the chain by the frontend —
// same convention VaultPanel.tsx already uses for paused()/maxSingleOfferLiability() —
// not mirrored into Mongo here, to avoid a second source of truth for numbers the
// contract itself can answer authoritatively.
const fundVaultSchema = new mongoose.Schema({
  ownerAddress:     { type: String, required: true, lowercase: true, unique: true, index: true },
  fundVaultAddress: { type: String, required: true, lowercase: true, unique: true, index: true },
  keeperAddress:    { type: String, lowercase: true },

  onChainPaused: { type: Boolean, default: false },

  // Same lifecycle as Vault.status — 'configuring' until a strategy is saved and the
  // manager-side compliance gate (below) is satisfied, 'active' while the keeper quotes,
  // 'stopped' on a keeper-triggered stop-loss (backend-only, no on-chain tx).
  status: { type: String, enum: ['configuring', 'active', 'stopped'], default: 'configuring' },

  strategy: {
    marginStrategyId: { type: String, enum: ['volume', 'balanced', 'safe', 'custom'], default: 'balanced' },
    customMargin:     { type: Number },
  },

  scope: [{
    eventId:  { type: String, required: true },
    outcomes: [{ type: Number }],
  }],

  maxExposureUsdt:        { type: Number, default: 0 },
  perMarketExposureUsdt:  { type: Number, default: 0 },
  stopLossUsdt:           { type: Number, default: 0 },
  minOdds:                { type: Number, default: 1.05 },
  maxOdds:                { type: Number, default: 20 },
  liabilityIncrementUsdt: { type: Number, default: 25 },

  // Manager-side "Liquidity Provision Agreement" — same EIP-712 flow and same
  // AGREEMENT_VERSION as services/agreement.js (the placer is providing/managing
  // liquidity into the Escrow, whether it's entirely their own capital or a fund with
  // LPs). This is a SEPARATE record from any single-owner Vault the same owner might
  // also have — a fund manager needs their own compliance record independent of that.
  // NOT to be confused with the LP-side "Fund Participation Agreement" (see
  // FundVaultLP.js / services/fundAgreement.js), which is the third-party investors'
  // own, legally-distinct consent record.
  agreementVersion:   { type: Number },
  agreementSignature: { type: String },
  agreementSignedAt:  { type: Date },

  kycStatus:      { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  kycRequestedAt: { type: Date },

  createdAtTx:    { type: String },
  createdAtBlock: { type: Number },
}, { timestamps: true });

module.exports = mongoose.model('FundVault', fundVaultSchema);
