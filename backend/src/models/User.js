const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  address:      { type: String, required: true, unique: true, lowercase: true },
  nickname:     { type: String, default: '', maxlength: 30, trim: true },
  bio:          { type: String, default: '', maxlength: 200, trim: true },
  totalPlaced:  { type: String, default: '0' }, // USDT 6-decimal as string
  totalBet:     { type: String, default: '0' },
  totalWon:     { type: String, default: '0' },
  activeOrders: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
