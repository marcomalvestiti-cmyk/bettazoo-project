const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request  = require('supertest');
const app      = require('../src/app');
const Order    = require('../src/models/Order');
const { analyzeRisk } = require('../src/services/aiService');

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
  await Order.deleteMany({});
});

// ─── helpers ────────────────────────────────────────────────────────────────
const USDT = (n) => String(BigInt(n) * 1_000_000n);  // USDT → 6-decimal raw string

function makeOrder(overrides = {}) {
  const odds = overrides.odds || 20000;
  return {
    offerId:            overrides.offerId   ?? 1,
    placer:             overrides.placer    || '0xaaaa',
    eventId:            overrides.eventId   || 'MATCH_001',
    outcome:            overrides.outcome   ?? 0,
    odds,
    oddsDecimal:        odds / 10000,
    liability:          overrides.liability || USDT(100),
    remainingLiability: overrides.remainingLiability || overrides.liability || USDT(100),
    active:             overrides.active    ?? true,
    txHash:             '0xfake',
  };
}

// ─── Order Book: sorting ─────────────────────────────────────────────────────
describe('GET /api/orderbook/:eventId — sorting', () => {
  it('returns orders sorted by odds DESC (best for bettor first)', async () => {
    await Order.insertMany([
      makeOrder({ offerId: 1, odds: 15000 }),  // 1.5x
      makeOrder({ offerId: 2, odds: 25000 }),  // 2.5x  ← best
      makeOrder({ offerId: 3, odds: 20000 }),  // 2.0x
    ]);

    const res = await request(app).get('/api/orderbook/MATCH_001');

    expect(res.status).toBe(200);
    expect(res.body.orders.map(o => o.offerId)).toEqual([2, 3, 1]);
  });

  it('returns empty array for unknown eventId', async () => {
    const res = await request(app).get('/api/orderbook/UNKNOWN');

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(0);
  });
});

// ─── Order Book: filtering ───────────────────────────────────────────────────
describe('GET /api/orderbook/:eventId — filtering', () => {
  beforeEach(async () => {
    await Order.insertMany([
      makeOrder({ offerId: 1, outcome: 0, odds: 20000 }),
      makeOrder({ offerId: 2, outcome: 1, odds: 35000 }),
      makeOrder({ offerId: 3, outcome: 2, odds: 40000 }),
      makeOrder({ offerId: 4, outcome: 0, odds: 22000, active: false }),
    ]);
  });

  it('returns all active orders when no outcome filter', async () => {
    const res = await request(app).get('/api/orderbook/MATCH_001');
    expect(res.body.orders).toHaveLength(3);
  });

  it('filters by outcome=0', async () => {
    const res = await request(app).get('/api/orderbook/MATCH_001?outcome=0');
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].outcome).toBe(0);
  });

  it('filters by outcome=1', async () => {
    const res = await request(app).get('/api/orderbook/MATCH_001?outcome=1');
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].oddsDecimal).toBe(3.5);
  });

  it('excludes inactive orders', async () => {
    const res = await request(app).get('/api/orderbook/MATCH_001?outcome=0');
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].offerId).toBe(1);
  });
});

// ─── Order Book: computed fields ─────────────────────────────────────────────
describe('GET /api/orderbook/:eventId — computed fields', () => {
  it('computes maxBettorStakeUsdt correctly for 2.0x odds / 100 USDT liability', async () => {
    // odds 2.0x (20000), liability 100 USDT
    // maxStake = 100 * 10000 / (20000 - 10000) = 100 * 10000 / 10000 = 100 USDT
    await Order.create(makeOrder({ offerId: 1, odds: 20000, liability: USDT(100) }));

    const res = await request(app).get('/api/orderbook/MATCH_001');
    expect(res.body.orders[0].maxBettorStakeUsdt).toBe('100.000000');
  });

  it('computes maxBettorStakeUsdt correctly for 3.0x odds / 60 USDT liability', async () => {
    // odds 3.0x (30000), liability 60 USDT
    // maxStake = 60 * 10000 / (30000 - 10000) = 600000 / 20000 = 30 USDT
    await Order.create(makeOrder({ offerId: 1, odds: 30000, liability: USDT(60) }));

    const res = await request(app).get('/api/orderbook/MATCH_001');
    expect(res.body.orders[0].maxBettorStakeUsdt).toBe('30.000000');
  });

  it('computes maxBettorStakeUsdt correctly for 2.5x odds / 75 USDT liability', async () => {
    // odds 2.5x (25000), liability 75 USDT
    // maxStake = 75 * 10000 / (25000 - 10000) = 750000 / 15000 = 50 USDT
    await Order.create(makeOrder({ offerId: 1, odds: 25000, liability: USDT(75) }));

    const res = await request(app).get('/api/orderbook/MATCH_001');
    expect(res.body.orders[0].maxBettorStakeUsdt).toBe('50.000000');
  });

  it('computes remainingLiabilityUsdt from raw 6-decimal value', async () => {
    await Order.create(makeOrder({ offerId: 1, odds: 20000, liability: USDT(150), remainingLiability: USDT(80) }));

    const res = await request(app).get('/api/orderbook/MATCH_001');
    expect(res.body.orders[0].remainingLiabilityUsdt).toBe('80.000000');
  });
});

// ─── Order Book: summary aggregation ─────────────────────────────────────────
describe('GET /api/orderbook/:eventId — summary', () => {
  it('groups orders by outcome with correct count and bestOdds', async () => {
    await Order.insertMany([
      makeOrder({ offerId: 1, outcome: 0, odds: 20000, liability: USDT(100) }),
      makeOrder({ offerId: 2, outcome: 0, odds: 22000, liability: USDT(80)  }),
      makeOrder({ offerId: 3, outcome: 1, odds: 35000, liability: USDT(60)  }),
    ]);

    const res = await request(app).get('/api/orderbook/MATCH_001');
    const { summary } = res.body;

    expect(summary['0'].count).toBe(2);
    expect(summary['0'].bestOdds).toBe(2.2);
    expect(summary['1'].count).toBe(1);
    expect(summary['1'].bestOdds).toBe(3.5);
  });

  it('sums totalLiquidityUsdt per outcome correctly', async () => {
    await Order.insertMany([
      makeOrder({ offerId: 1, outcome: 0, odds: 20000, liability: USDT(100), remainingLiability: USDT(60) }),
      makeOrder({ offerId: 2, outcome: 0, odds: 22000, liability: USDT(80),  remainingLiability: USDT(80) }),
    ]);

    const res = await request(app).get('/api/orderbook/MATCH_001');
    expect(res.body.summary['0'].totalLiquidityUsdt).toBeCloseTo(140, 4);
  });
});

// ─── Multi-matching scenario (mirrors the smart contract test) ────────────────
describe('Order Book multi-matching aggregation scenario', () => {
  it('correctly represents 3-placer scenario: 100+60+75 USDT liabilities', async () => {
    // Same as BettazooEscrow.test.js multi-matching scenario
    // Placer A: 2.0x, 100 USDT liability → maxStake=100 USDT
    // Placer B: 3.0x, 60 USDT liability  → maxStake=30 USDT
    // Placer C: 2.5x, 75 USDT liability  → maxStake=50 USDT
    // Total available stake for bettor = 180 USDT
    await Order.insertMany([
      makeOrder({ offerId: 0, placer: '0xaaa', odds: 20000, liability: USDT(100) }),
      makeOrder({ offerId: 1, placer: '0xbbb', odds: 30000, liability: USDT(60)  }),
      makeOrder({ offerId: 2, placer: '0xccc', odds: 25000, liability: USDT(75)  }),
    ]);

    const res = await request(app).get('/api/orderbook/MATCH_001?outcome=0');
    expect(res.status).toBe(200);

    const orders = res.body.orders;
    expect(orders).toHaveLength(3);

    // Sorted best-first: 3.0x, 2.5x, 2.0x
    expect(orders[0].oddsDecimal).toBe(3.0);
    expect(orders[1].oddsDecimal).toBe(2.5);
    expect(orders[2].oddsDecimal).toBe(2.0);

    // Max bettor stakes
    expect(orders[0].maxBettorStakeUsdt).toBe('30.000000');
    expect(orders[1].maxBettorStakeUsdt).toBe('50.000000');
    expect(orders[2].maxBettorStakeUsdt).toBe('100.000000');

    // Total available liquidity for bettor = 30 + 50 + 100 = 180 USDT
    const totalMaxStake = orders.reduce((s, o) => s + Number(o.maxBettorStakeUsdt), 0);
    expect(totalMaxStake).toBeCloseTo(180, 4);
  });

  it('reflects partial match: after 100 USDT stake consumed, remainingLiability updates', async () => {
    // After a 100 USDT stake consumes all of offer 0 (2.0x) and part of offer 2 (2.5x):
    // offer 0: remainingLiability = 0 → active=false
    // offer 2: bettorStake on this = 100 - 100 = 0... wait let me recalc
    // Actually: bettor stakes 120 USDT against these 3 offers sorted best-first
    // Best: offer 1 (3.0x) maxStake=30 → consumes 30, liability consumed = 30*(30000-10000)/10000 = 30*2=60 USDT
    // Next: offer 2 (2.5x) maxStake=50 → consumes 50, liability consumed = 50*(25000-10000)/10000 = 50*1.5=75 USDT
    // Next: offer 0 (2.0x) maxStake=100 → consumes 40 (remaining), liability = 40*1=40 USDT → remaining=60

    // Simulate state after partial match
    await Order.insertMany([
      makeOrder({ offerId: 0, placer: '0xaaa', odds: 20000, liability: USDT(100), remainingLiability: USDT(60)  }),
      makeOrder({ offerId: 1, placer: '0xbbb', odds: 30000, liability: USDT(60),  remainingLiability: USDT(0),  active: false }),
      makeOrder({ offerId: 2, placer: '0xccc', odds: 25000, liability: USDT(75),  remainingLiability: USDT(0),  active: false }),
    ]);

    const res = await request(app).get('/api/orderbook/MATCH_001?outcome=0');
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].offerId).toBe(0);
    expect(res.body.orders[0].remainingLiabilityUsdt).toBe('60.000000');
    // maxStake with 60 remaining at 2.0x = 60 USDT
    expect(res.body.orders[0].maxBettorStakeUsdt).toBe('60.000000');
  });
});

// ─── AI Service: risk manager ────────────────────────────────────────────────
describe('analyzeRisk — risk manager logic', () => {
  it('returns LOW risk when exposure is spread across multiple events', () => {
    const orders = [
      { eventId: 'MATCH_001', outcome: 0, remainingLiability: USDT(100) },
      { eventId: 'MATCH_002', outcome: 0, remainingLiability: USDT(100) },
      { eventId: 'MATCH_003', outcome: 0, remainingLiability: USDT(100) },
    ];
    const result = analyzeRisk(orders);
    expect(result.riskLevel).toBe('LOW');
    expect(result.totalExposureUsdt).toBe('300.00');
    expect(result.alert).toBeNull();
  });

  it('returns HIGH risk when >70% on one event/outcome', () => {
    const orders = [
      { eventId: 'MATCH_001', outcome: 0, remainingLiability: USDT(800) },
      { eventId: 'MATCH_002', outcome: 0, remainingLiability: USDT(100) },
    ];
    const result = analyzeRisk(orders);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.alert).toMatch(/Sbilanciamento/);
    expect(result.exposures[0].sharePercent).toBeGreaterThan(70);
  });

  it('returns MEDIUM risk at ~50% concentration', () => {
    const orders = [
      { eventId: 'MATCH_001', outcome: 0, remainingLiability: USDT(500) },
      { eventId: 'MATCH_002', outcome: 0, remainingLiability: USDT(300) },
      { eventId: 'MATCH_003', outcome: 0, remainingLiability: USDT(200) },
    ];
    const result = analyzeRisk(orders);
    expect(result.riskLevel).toBe('MEDIUM');
  });

  it('returns LOW and no alert for empty order list', () => {
    const result = analyzeRisk([]);
    expect(result.riskLevel).toBe('LOW');
    expect(result.alert).toBeNull();
    expect(result.totalExposureUsdt).toBe('0.00');
  });

  it('aggregates multiple orders on same eventId:outcome correctly', () => {
    const orders = [
      { eventId: 'MATCH_001', outcome: 0, remainingLiability: USDT(50) },
      { eventId: 'MATCH_001', outcome: 0, remainingLiability: USDT(70) },
    ];
    const result = analyzeRisk(orders);
    expect(result.totalExposureUsdt).toBe('120.00');
    expect(result.exposures).toHaveLength(1);
    expect(result.exposures[0].orderCount).toBe(2);
  });
});

// ─── AI Endpoint: POST /api/ai/suggest-odds ──────────────────────────────────
describe('POST /api/ai/suggest-odds', () => {
  it('returns 400 when eventId is missing', async () => {
    const res = await request(app).post('/api/ai/suggest-odds').send({ eventName: 'Test' });
    expect(res.status).toBe(400);
  });

  it('returns mock JSON with correct shape when no OPENAI_API_KEY', async () => {
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const res = await request(app)
      .post('/api/ai/suggest-odds')
      .send({
        eventId: 'MATCH_001',
        eventName: 'Inter vs Milan',
        sport: 'football',
        teams: ['Inter', 'Milan'],
        currentMarketOdds: { home: 2.1, draw: 3.4, away: 3.8 },
      });

    expect(res.status).toBe(200);
    expect(res.body.suggestedOdds).toHaveProperty('home');
    expect(res.body.suggestedOdds).toHaveProperty('draw');
    expect(res.body.suggestedOdds).toHaveProperty('away');
    expect(res.body.impliedProbabilities.marginPercent).toBeGreaterThan(0);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(res.body.riskLevel);
    expect(res.body.source).toBe('mock');

    process.env.OPENAI_API_KEY = savedKey;
  });
});
