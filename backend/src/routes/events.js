const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { CURATED_EVENTS } = require('../data/curatedEvents');
const { isEventOpen } = require('../services/eventStatus');

function isDbOffline(err) {
  const msg = err?.message ?? '';
  return (
    msg.includes('bufferCommands') ||
    msg.includes('before initial connection') ||
    err?.name === 'MongoNotConnectedError' ||
    err?.name === 'MongoNetworkError' ||
    err?.name === 'MongoServerSelectionError'
  );
}

function toPublicShape(doc) {
  return {
    eventId:     doc.eventId,
    name:        doc.name,
    category:    doc.category,
    sport:       doc.sport,
    league:      doc.league,
    sportLabel:  doc.sportLabel,
    leagueLabel: doc.leagueLabel,
    icon:        doc.icon,
    teams:       doc.teams,
    startTime:   doc.startTime instanceof Date ? doc.startTime.toISOString() : doc.startTime,
    source:      doc.source ?? 'curated',
    resolved:    Boolean(doc.resolved),
  };
}

// GET /api/events — the event catalog, replacing the old hardcoded MOCK_EVENTS
// array in the frontend. Curated fixtures (see data/curatedEvents.js) ship until
// ODDS_API_KEY is configured on the backend; once live football fixtures exist for
// a league, the curated football fallback for that sport is hidden in favor of real
// data — basketball/tennis/esports stay curated regardless (see
// services/eventsFeedService.js for why football is the first live sport).
router.get('/', async (req, res, next) => {
  try {
    const docs = await Event.find({}).lean();
    if (docs.length === 0) return res.json({ events: CURATED_EVENTS });

    const hasLiveFootball = docs.some((d) => d.source === 'live');
    let visible = hasLiveFootball
      ? docs.filter((d) => !(d.source === 'curated' && d.sport === 'football'))
      : docs;

    // ?open=1 — only events you can still bet on (listings, placer pickers). Once
    // any real fixture is open, the curated catalog is dropped entirely: its results
    // would have to be invented by hand, and its start times are relative to the last
    // backend boot (data/curatedEvents.js), so they go stale.
    if (req.query.open === '1' || req.query.open === 'true') {
      visible = visible.filter((d) => isEventOpen(d));
      if (visible.some((d) => d.source === 'live')) {
        visible = visible.filter((d) => d.source === 'live');
      }
      visible.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    }

    res.json({ events: visible.map(toPublicShape) });
  } catch (err) {
    if (isDbOffline(err)) return res.json({ events: CURATED_EVENTS, _offline: true });
    next(err);
  }
});

module.exports = router;
