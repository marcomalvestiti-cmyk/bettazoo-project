const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request  = require('supertest');
const app      = require('../src/app');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(() => {
  delete process.env.ADMIN_SECRET;
});

describe('/api/admin/* — shared-secret gate', () => {
  it('stays open when ADMIN_SECRET is not configured (default/current behavior)', async () => {
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(200);
  });

  it('rejects requests with no header once ADMIN_SECRET is set', async () => {
    process.env.ADMIN_SECRET = 'topsecret';
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(401);
  });

  it('rejects the wrong secret', async () => {
    process.env.ADMIN_SECRET = 'topsecret';
    const res = await request(app).get('/api/admin/status').set('x-admin-secret', 'wrong');
    expect(res.status).toBe(401);
  });

  it('accepts the correct secret', async () => {
    process.env.ADMIN_SECRET = 'topsecret';
    const res = await request(app).get('/api/admin/status').set('x-admin-secret', 'topsecret');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/oracle/resolve — same gate', () => {
  it('rejects without the secret once ADMIN_SECRET is set', async () => {
    process.env.ADMIN_SECRET = 'topsecret';
    const res = await request(app)
      .post('/api/oracle/resolve')
      .send({ eventId: 'evt-001', winningOutcome: 0 });
    expect(res.status).toBe(401);
  });

  it('accepts with the correct secret', async () => {
    process.env.ADMIN_SECRET = 'topsecret';
    const res = await request(app)
      .post('/api/oracle/resolve')
      .set('x-admin-secret', 'topsecret')
      .send({ eventId: 'evt-001', winningOutcome: 0 });
    expect(res.status).toBe(200);
  });
});
