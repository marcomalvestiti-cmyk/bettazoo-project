const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request  = require('supertest');
const app      = require('../src/app');
const Vault    = require('../src/models/Vault');

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
  await Vault.deleteMany({});
});

function makeVault(overrides = {}) {
  return {
    ownerAddress: '0x' + '1'.repeat(40),
    vaultAddress: '0x' + '2'.repeat(40),
    status: 'configuring',
    ...overrides,
  };
}

describe('GET /api/admin/vaults', () => {
  it('returns an empty list when no vaults exist', async () => {
    const res = await request(app).get('/api/admin/vaults');
    expect(res.status).toBe(200);
    expect(res.body.vaults).toEqual([]);
  });

  it('lists owner/vault address pairs with default fee state when no override was ever set', async () => {
    await Vault.create(makeVault());
    const res = await request(app).get('/api/admin/vaults');
    expect(res.status).toBe(200);
    expect(res.body.vaults).toHaveLength(1);
    expect(res.body.vaults[0]).toMatchObject({
      ownerAddress: '0x' + '1'.repeat(40),
      vaultAddress: '0x' + '2'.repeat(40),
      feeOverridePercent: null,
      hasFeeOverride: false,
    });
  });

  it('reflects a fee override mirrored from the on-chain event', async () => {
    await Vault.create(makeVault({ feeOverridePercent: 20, hasFeeOverride: true }));
    const res = await request(app).get('/api/admin/vaults');
    expect(res.body.vaults[0].feeOverridePercent).toBe(20);
    expect(res.body.vaults[0].hasFeeOverride).toBe(true);
  });

  it('is gated behind ADMIN_SECRET like the rest of /api/admin', async () => {
    process.env.ADMIN_SECRET = 'topsecret';
    try {
      const res = await request(app).get('/api/admin/vaults');
      expect(res.status).toBe(401);
    } finally {
      delete process.env.ADMIN_SECRET;
    }
  });
});
