const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  offerId:             { type: Number, required: true, unique: true },
  placer:              { type: String, required: true, lowercase: true },
  eventId:             { type: String, required: true, index: true },
  outcome:             { type: Number, required: true },
  odds:                { type: Number, required: true }, // odds * ODDS_PRECISION (e.g. 2.5x → 25000)
  oddsDecimal:         { type: Number, required: true }, // human-readable (odds / 10000)
  liability:           { type: String, required: true }, // USDT 6-decimal, stored as string
  remainingLiability:  { type: String, required: true },
  active:              { type: Boolean, default: true, index: true },
  txHash:              { type: String },
  blockNumber:         { type: Number },
}, { timestamps: true });

orderSchema.index({ eventId: 1, active: 1, odds: -1 });
orderSchema.index({ placer: 1, active: 1 });

module.exports = mongoose.model('Order', orderSchema);
