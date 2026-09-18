const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request  = require('supertest');
const app      = require('../src/app');
const BetMatch = require('../src/models/BetMatch');

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
  await BetMatch.deleteMany({});
});

const bettor = '0xbb00000000000000000000000000000000bbbb';

function makeMatch(overrides = {}) {
  return {
    matchId: 1,
    offerId: 10,
    placer: '0xaaaa',
    bettor,
    eventId: 'evt-001',
    outcome: 0,
    odds: 25000, // raw ODDS_PRECISION scale — 2.5x
    bettorStake: String(5n * 1_000_000n),     // $5
    placerLiability: String(7n * 1_000_000n), // $7
    settled: false,
    settledOutcome: null,
    ...overrides,
  };
}

describe('GET /api/bettor/:address/bets', () => {
  it('returns an empty list for a bettor with no matches', async () => {
    const res = await request(app).get(`/api/bettor/${bettor}/bets`);
    expect(res.status).toBe(200);
    expect(res.body.bets).toEqual([]);
  });

  it('converts raw odds/stake to decimal/USDT and is case-insensitive on the address', async () => {
    await BetMatch.create(makeMatch());
    const res = await request(app).get(`/api/bettor/${bettor.toUpperCase()}/bets`);
    expect(res.status).toBe(200);
    expect(res.body.bets).toHaveLength(1);
    expect(res.body.bets[0]).toMatchObject({
      matchId: 1,
      eventId: 'evt-001',
      outcome: 0,
      oddsDecimal: 2.5,
      stakeUsdt: 5,
      settled: false,
      settledOutcome: null,
    });
  });

  it('only returns matches for the requested bettor, not other bettors on the same offer', async () => {
    await BetMatch.create(makeMatch({ matchId: 1, bettor }));
    await BetMatch.create(makeMatch({ matchId: 2, bettor: '0xcc00000000000000000000000000000000cccc' }));
    const res = await request(app).get(`/api/bettor/${bettor}/bets`);
    expect(res.body.bets).toHaveLength(1);
    expect(res.body.bets[0].matchId).toBe(1);
  });

  it('reflects settlement once EventResolved has been indexed', async () => {
    await BetMatch.create(makeMatch({ settled: true, settledOutcome: 0 }));
    const res = await request(app).get(`/api/bettor/${bettor}/bets`);
    expect(res.body.bets[0]).toMatchObject({ settled: true, settledOutcome: 0 });
  });
});
