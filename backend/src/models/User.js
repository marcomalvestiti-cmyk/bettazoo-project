const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  address:      { type: String, required: true, unique: true, lowercase: true },
  totalPlaced:  { type: String, default: '0' }, // USDT 6-decimal as string
  totalBet:     { type: String, default: '0' },
  totalWon:     { type: String, default: '0' },
  activeOrders: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
