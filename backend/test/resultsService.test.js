const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const Event = require('../src/models/Event');
const { syncResults, outcomeFromScores } = require('../src/services/resultsService');

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => { await Event.deleteMany({}); });

const HOUR = 3_600_000;
const fixture = (id, home, away, completed = true) => ({
  id, completed, home_team: 'Roma', away_team: 'Napoli',
  scores: completed ? [{ name: 'Napoli', score: String(away) }, { name: 'Roma', score: String(home) }] : null,
});
const okResponse = (body, remaining = '400') => ({
  ok: true, json: async () => body, headers: { get: (h) => (h === 'x-requests-remaining' ? remaining : null) },
});

describe('outcomeFromScores', () => {
  it('maps home win / draw / away win to 0 / 1 / 2 regardless of score order', () => {
    expect(outcomeFromScores(fixture('a', 2, 1))).toBe(0);
    expect(outcomeFromScores(fixture('a', 1, 1))).toBe(1);
    expect(outcomeFromScores(fixture('a', 0, 3))).toBe(2);
  });
  it('returns null for unfinished or unreadable fixtures', () => {
    expect(outcomeFromScores(fixture('a', 0, 0, false))).toBeNull();
    expect(outcomeFromScores({ completed: true, home_team: 'X', away_team: 'Y', scores: [] })).toBeNull();
  });
});

describe('syncResults', () => {
  const base = { category: 'sports', sport: 'football', league: 'serie-a', teams: ['Roma', 'Napoli'], source: 'live' };

  it('resolves finished live fixtures on-chain and in the DB, skipping the rest', async () => {
    await Event.create([
      { ...base, eventId: 'live-done', name: 'done', startTime: new Date(Date.now() - 4 * HOUR) },
      { ...base, eventId: 'live-running', name: 'running', startTime: new Date(Date.now() - 3 * HOUR) },
      { ...base, eventId: 'live-recent', name: 'recent', startTime: new Date(Date.now() - 1 * HOUR) },
    ]);
    const fetchImpl = jest.fn(async () => okResponse([
      fixture('done', 0, 2),
      fixture('running', 1, 0, false),
      fixture('recent', 3, 0),
    ]));
    const resolveOnChain = jest.fn(async () => ({ txHash: '0xabc' }));

    const summary = await syncResults({ apiKey: 'k', fetchImpl, resolveOnChain });

    expect(summary.resolved).toEqual(['live-done']);
    expect(resolveOnChain).toHaveBeenCalledWith('live-done', 2);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // only serie-a has pending events
    expect(fetchImpl.mock.calls[0][0]).toContain('soccer_italy_serie_a/scores');
    const done = await Event.findOne({ eventId: 'live-done' }).lean();
    expect(done).toMatchObject({ resolved: true, winningOutcome: 2 });
    const running = await Event.findOne({ eventId: 'live-running' }).lean();
    expect(running.resolved).toBe(false);
  });

  it('makes no API call when nothing is pending', async () => {
    await Event.create({ ...base, eventId: 'live-future', name: 'f', startTime: new Date(Date.now() + HOUR) });
    const fetchImpl = jest.fn();
    await syncResults({ apiKey: 'k', fetchImpl, resolveOnChain: jest.fn() });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('leaves the DB untouched when the on-chain resolve fails', async () => {
    await Event.create({ ...base, eventId: 'live-done', name: 'done', startTime: new Date(Date.now() - 4 * HOUR) });
    const fetchImpl = jest.fn(async () => okResponse([fixture('done', 1, 1)]));
    const resolveOnChain = jest.fn(async () => { throw new Error('rpc down'); });
    const summary = await syncResults({ apiKey: 'k', fetchImpl, resolveOnChain });
    expect(summary.resolved).toEqual([]);
    const ev = await Event.findOne({ eventId: 'live-done' }).lean();
    expect(ev.resolved).toBe(false);
  });
});
