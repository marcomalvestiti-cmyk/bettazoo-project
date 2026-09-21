const mongoose = require('mongoose');

const vaultSchema = new mongoose.Schema({
  ownerAddress:  { type: String, required: true, lowercase: true, unique: true, index: true },
  vaultAddress:  { type: String, required: true, lowercase: true, unique: true, index: true },
  keeperAddress: { type: String, lowercase: true },

  // Mirrored from on-chain Paused/Unpaused events — authoritative for "can the keeper act".
  onChainPaused: { type: Boolean, default: false },

  // 'configuring': created on-chain but no strategy saved yet.
  // 'active':      keeper is quoting per the strategy below.
  // 'stopped':     keeper-triggered stop-loss — backend-only, no on-chain tx.
  status: { type: String, enum: ['configuring', 'active', 'stopped'], default: 'configuring' },

  strategy: {
    marginStrategyId: { type: String, enum: ['volume', 'balanced', 'safe', 'custom'], default: 'balanced' },
    customMargin:     { type: Number }, // used only when marginStrategyId === 'custom'
  },

  // Explicit opt-in only — no wildcard "all markets" in v1.
  scope: [{
    eventId:  { type: String, required: true },
    outcomes: [{ type: Number }],
  }],

  maxExposureUsdt:        { type: Number, default: 0 }, // 0 = no soft cap beyond vault balance
  perMarketExposureUsdt:  { type: Number, default: 0 },
  stopLossUsdt:           { type: Number, default: 0 }, // 0 = disabled
  minOdds:                { type: Number, default: 1.05 },
  maxOdds:                { type: Number, default: 20 },
  liabilityIncrementUsdt: { type: Number, default: 25 },

  // Liquidity Provision Agreement — EIP-712 signature (see services/agreement.js).
  // Not legally binding yet (no licensed OpCo exists at time of writing); recorded so
  // the consent flow itself is proven out before mainnet, and versioned so a terms
  // change invalidates old signatures (agreementVersion must equal the current one).
  agreementVersion:   { type: Number },
  agreementSignature: { type: String },
  agreementSignedAt:  { type: Date },

  // KYC gate — blocks keeper activation, not withdrawal (the vault is onlyOwner with
  // no recipient parameter, so a withdrawal can never be gated by the backend; see
  // the Tier 0 audit). 'none'/'pending' set by the owner (request review), 'approved'/
  // 'rejected' set only via the admin panel — no Sumsub integration yet on testnet,
  // this proves the enforcement point ahead of wiring a real verification provider.
  kycStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  kycRequestedAt: { type: Date },

  // Vigorish per-vault (Tier 3) — mirrored from BettazooEscrow's PlacerFeeOverrideUpdated
  // event by web3Listener.js. The contract is authoritative; this is display-only (set
  // by the platform admin via /admin/fees, never by the vault owner).
  feeOverridePercent: { type: Number, default: null },
  hasFeeOverride:     { type: Boolean, default: false },

  createdAtTx:    { type: String },
  createdAtBlock: { type: Number },
}, { timestamps: true });

module.exports = mongoose.model('Vault', vaultSchema);
