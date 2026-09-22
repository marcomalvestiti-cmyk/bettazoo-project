const mongoose = require('mongoose');

// Per-(fund vault, LP) compliance record. The final gate that actually matters —
// whether an address can deposit — lives on-chain (PlacerFundVault.approvedLPs, set by
// the fund manager via setApprovedLP). This collection only holds the off-chain
// paperwork that has no on-chain equivalent: the LP's own "Fund Participation
// Agreement" signature (see services/fundAgreement.js — a separate, legally-distinct
// consent record from the manager-side "Liquidity Provision Agreement" on FundVault.js)
// and their KYC review status, both of which a fund manager would check before calling
// setApprovedLP. `approved` here mirrors the on-chain mapping (kept in sync by
// services/fundVaultListener.js on ApprovedLPUpdated) purely so the manager's "who's
// approved" list can be rendered without N separate chain reads.
const fundVaultLPSchema = new mongoose.Schema({
  fundVaultAddress: { type: String, required: true, lowercase: true, index: true },
  lpAddress:        { type: String, required: true, lowercase: true, index: true },

  approved: { type: Boolean, default: false },

  agreementVersion:   { type: Number },
  agreementSignature: { type: String },
  agreementSignedAt:  { type: Date },

  kycStatus:      { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  kycRequestedAt: { type: Date },
}, { timestamps: true });

fundVaultLPSchema.index({ fundVaultAddress: 1, lpAddress: 1 }, { unique: true });

module.exports = mongoose.model('FundVaultLP', fundVaultLPSchema);
