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

  createdAtTx:    { type: String },
  createdAtBlock: { type: Number },
}, { timestamps: true });

module.exports = mongoose.model('Vault', vaultSchema);
