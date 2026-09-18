const mongoose = require('mongoose');

// Per-match record of Escrow's OfferMatched/EventResolved events, needed to compute a
// placer's (or vault's) realized P&L — Order.js only tracks remaining liquidity per
// offer, not individual matches, so it can't answer "did this placer actually win or
// lose money" on its own.
const betMatchSchema = new mongoose.Schema({
  matchId:        { type: Number, required: true, unique: true }, // on-chain BetRecord.id
  offerId:        { type: Number, required: true, index: true },
  placer:         { type: String, required: true, lowercase: true, index: true },
  bettor:         { type: String, required: true, lowercase: true, index: true },
  eventId:        { type: String, required: true, index: true },
  outcome:        { type: Number, required: true },
  odds:           { type: Number, required: true },
  bettorStake:    { type: String, required: true }, // USDT 6-decimal, stored as string
  placerLiability:{ type: String, required: true },
  settled:        { type: Boolean, default: false, index: true },
  settledOutcome: { type: Number, default: null },
}, { timestamps: true });

betMatchSchema.index({ placer: 1, settled: 1 });

module.exports = mongoose.model('BetMatch', betMatchSchema);
