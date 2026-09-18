const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  eventId:        { type: String, required: true, unique: true },
  name:           { type: String },
  category:       { type: String, enum: ['sports', 'esports'], default: 'sports' },
  sport:          { type: String, default: 'football' },
  league:         { type: String },
  sportLabel:     { type: String },
  leagueLabel:    { type: String },
  icon:           { type: String },
  teams:          [String],
  startTime:      { type: Date },
  // 'curated' = editorially seeded (data/curatedEvents.js), 'live' = synced from a
  // real odds feed (see services/eventsFeedService.js).
  source:         { type: String, enum: ['curated', 'live'], default: 'curated' },
  // [home, draw, away] consensus decimal odds from the live feed, when available.
  // Not used to price anything yet — captured for the Tier 2 Quant Engine.
  referenceOdds:  [Number],
  resolved:       { type: Boolean, default: false },
  winningOutcome: { type: Number },
  resolvedAt:     { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
