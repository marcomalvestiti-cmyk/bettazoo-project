const mongoose = require('mongoose');

// One record per address that received testnet ETH from the gas faucet
// (services/gasFaucet.js). The unique index on address is the "once per wallet"
// guarantee: the record is inserted *before* the transfer is sent, so two
// concurrent claims for the same address can't both pass.
const gasDripSchema = new mongoose.Schema({
  address:   { type: String, required: true, unique: true, lowercase: true },
  amountWei: { type: String, required: true },
  ip:        { type: String },
  txHash:    { type: String },
  status:    { type: String, enum: ['pending', 'sent'], default: 'pending' },
}, { timestamps: true });

gasDripSchema.index({ createdAt: 1 });
gasDripSchema.index({ ip: 1, createdAt: 1 });

module.exports = mongoose.model('GasDrip', gasDripSchema);
