const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request  = require('supertest');
const app      = require('../src/app');
const Event    = require('../src/models/Event');
const { CURATED_EVENTS } = require('../src/data/curatedEvents');
const { seedCuratedEvents } = require('../src/services/eventsFeedService');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Event.deleteMany({});
});

// ─── GET /api/events — empty DB fallback ────────────────────────────────────
describe('GET /api/events — no DB data yet', () => {
  it('falls back to the curated catalog constant', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(CURATED_EVENTS.length);
    expect(res.body.events.map((e) => e.eventId)).toEqual(
      expect.arrayContaining(['evt-001', 'evt-007', 'evt-010'])
    );
  });
});

// ─── seedCuratedEvents ───────────────────────────────────────────────────────
describe('seedCuratedEvents', () => {
  it('upserts every curated event and is idempotent', async () => {
    await seedCuratedEvents();
    await seedCuratedEvents(); // second call must not duplicate or error
    const count = await Event.countDocuments({});
    expect(count).toBe(CURATED_EVENTS.length);
  });

  it('never overwrites an already-resolved event', async () => {
    await seedCuratedEvents();
    await Event.findOneAndUpdate(
      { eventId: 'evt-002' },
      { resolved: true, winningOutcome: 0, resolvedAt: new Date() }
    );

    await seedCuratedEvents(); // re-seed, as happens on every backend boot

    const ev = await Event.findOne({ eventId: 'evt-002' }).lean();
    expect(ev.resolved).toBe(true);
    expect(ev.winningOutcome).toBe(0);
  });
});

// ─── GET /api/events — live football hides curated football ────────────────
describe('GET /api/events — live football fixtures present', () => {
  it('hides curated football fixtures but keeps basketball/tennis/esports', async () => {
    await seedCuratedEvents();
    await Event.create({
      eventId: 'live-abc123',
      name: 'Roma vs Napoli',
      category: 'sports',
      sport: 'football',
      league: 'serie-a',
      sportLabel: 'Football',
      leagueLabel: 'Serie A',
      icon: '⚽',
      teams: ['Roma', 'Napoli'],
      startTime: new Date(),
      source: 'live',
      referenceOdds: [2.1, 3.4, 3.2],
    });

    const res = await request(app).get('/api/events');
    const ids = res.body.events.map((e) => e.eventId);

    expect(ids).toContain('live-abc123');
    expect(ids).not.toContain('evt-001'); // curated Serie A — superseded
    expect(ids).toContain('evt-007'); // curated NBA — untouched
    expect(ids).toContain('evt-010'); // curated esports — untouched
  });
});
