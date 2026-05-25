const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  placer:  { type: String, required: true, lowercase: true, index: true },
  bettor:  { type: String, required: true, lowercase: true },
  offerId: { type: Number, required: true },
  eventId: { type: String, required: true },
}, { timestamps: true });

referralSchema.index({ placer: 1, bettor: 1, offerId: 1 }, { unique: true });

module.exports = mongoose.model('Referral', referralSchema);
