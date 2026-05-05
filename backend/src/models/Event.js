const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  eventId:        { type: String, required: true, unique: true },
  name:           { type: String },
  sport:          { type: String, default: 'football' },
  teams:          [String],
  startTime:      { type: Date },
  resolved:       { type: Boolean, default: false },
  winningOutcome: { type: Number },
  resolvedAt:     { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
