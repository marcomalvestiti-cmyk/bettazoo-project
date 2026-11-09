const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { ethers } = require('ethers');
const app = require('../src/app');
const GasDrip = require('../src/models/GasDrip');
const { createGasFaucet } = require('../src/services/gasFaucet');

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await GasDrip.init(); // build the unique index before the race test
});
afterAll(async () => {
  app.set('gasFaucet', undefined);
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => { await GasDrip.deleteMany({}); });

const USER = '0x1111111111111111111111111111111111111111';
const FAUCET = '0x2222222222222222222222222222222222222222';
const config = {
  amountWei: ethers.parseEther('0.0005'),
  reserveWei: ethers.parseEther('0.002'),
  dailyLimit: 3,
  perIpDaily: 2,
};

function makeFaucet({ balances = {}, sendEth } = {}) {
  const send = sendEth ?? jest.fn(async () => '0xtx');
  const faucet = createGasFaucet({
    config,
    faucetAddress: FAUCET,
    getBalance: async (a) => balances[a] ?? (a === FAUCET ? ethers.parseEther('1') : 0n),
    sendEth: send,
  });
  return { faucet, send };
}

describe('gas faucet service', () => {
  it('sends once per address', async () => {
    const { faucet, send } = makeFaucet();
    const first = await faucet.claim(USER, '1.1.1.1');
    expect(first).toMatchObject({ claimed: true, txHash: '0xtx' });
    const second = await faucet.claim(USER, '1.1.1.1');
    expect(second).toMatchObject({ eligible: false, reason: 'already_claimed' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent claims for the same address into one transfer', async () => {
    const { faucet, send } = makeFaucet();
    const results = await Promise.all([faucet.claim(USER), faucet.claim(USER), faucet.claim(USER)]);
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('skips wallets that already have gas', async () => {
    const { faucet } = makeFaucet({ balances: { [USER]: ethers.parseEther('0.01') } });
    expect(await faucet.status(USER)).toMatchObject({ eligible: false, reason: 'has_balance' });
  });

  it('enforces the per-IP and global daily limits', async () => {
    const { faucet } = makeFaucet();
    const addr = (n) => '0x' + String(n).padStart(40, '0');
    expect((await faucet.claim(addr(1), 'ip-a')).claimed).toBe(true);
    expect((await faucet.claim(addr(2), 'ip-a')).claimed).toBe(true);
    expect(await faucet.claim(addr(3), 'ip-a')).toMatchObject({ reason: 'ip_limit' });
    expect((await faucet.claim(addr(4), 'ip-b')).claimed).toBe(true);
    expect(await faucet.claim(addr(5), 'ip-c')).toMatchObject({ reason: 'daily_limit' });
  });

  it('refuses when the faucet wallet would dip into its reserve', async () => {
    const { faucet } = makeFaucet({ balances: { [FAUCET]: ethers.parseEther('0.001') } });
    expect(await faucet.status(USER)).toMatchObject({ eligible: false, reason: 'faucet_empty' });
  });

  it('releases the slot when the transfer fails, so the user can retry', async () => {
    const { faucet } = makeFaucet({ sendEth: jest.fn(async () => { throw new Error('rpc down'); }) });
    expect(await faucet.claim(USER)).toMatchObject({ reason: 'send_failed' });
    expect(await GasDrip.countDocuments({})).toBe(0);
  });
});

describe('faucet routes', () => {
  it('reports status and claims through the API', async () => {
    const { faucet } = makeFaucet();
    app.set('gasFaucet', faucet);

    const s = await request(app).get(`/api/faucet/gas/${USER}`);
    expect(s.body).toMatchObject({ eligible: true, amountEth: '0.0005' });

    const c = await request(app).post('/api/faucet/gas').send({ address: USER });
    expect(c.status).toBe(200);
    expect(c.body.claimed).toBe(true);

    const again = await request(app).post('/api/faucet/gas').send({ address: USER });
    expect(again.status).toBe(429);

    const bad = await request(app).post('/api/faucet/gas').send({ address: 'nope' });
    expect(bad.status).toBe(400);
  });
});
