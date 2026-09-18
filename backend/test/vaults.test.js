const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request  = require('supertest');
const { ethers } = require('ethers');
const app      = require('../src/app');
const Vault    = require('../src/models/Vault');
const Order    = require('../src/models/Order');
const BetMatch = require('../src/models/BetMatch');
const vaultsRouter = require('../src/routes/vaults');
const { AGREEMENT_VERSION, AGREEMENT_DOMAIN, AGREEMENT_TYPES } = require('../src/services/agreement');

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
  await Order.deleteMany({});
  await BetMatch.deleteMany({});
});

const USDT = (n) => String(BigInt(n) * 1_000_000n);

const owner = ethers.Wallet.createRandom();
const ownerAddress = owner.address.toLowerCase();
const vaultAddress = '0x' + '9'.repeat(40);

async function signConfig(signer, address, timestamp) {
  const message = vaultsRouter.buildSignMessage(address, timestamp);
  return signer.signMessage(message);
}

async function signAgreement(signer, address, timestamp, version = AGREEMENT_VERSION) {
  const value = { owner: address, version, timestamp };
  return signer.signTypedData(AGREEMENT_DOMAIN, AGREEMENT_TYPES, value);
}

function makeVault(overrides = {}) {
  return {
    ownerAddress,
    vaultAddress,
    keeperAddress: '0x' + '1'.repeat(40),
    status: 'configuring',
    onChainPaused: false,
    strategy: { marginStrategyId: 'balanced' },
    scope: [],
    maxExposureUsdt: 0,
    perMarketExposureUsdt: 0,
    stopLossUsdt: 0,
    minOdds: 1.05,
    maxOdds: 20,
    liabilityIncrementUsdt: 25,
    ...overrides,
  };
}

describe('GET /api/vaults/:ownerAddress', () => {
  it('returns exists:false when no vault has been created for this owner', async () => {
    const res = await request(app).get(`/api/vaults/${ownerAddress}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
  });

  it('returns the vault config when one exists', async () => {
    await Vault.create(makeVault());
    const res = await request(app).get(`/api/vaults/${ownerAddress}`);
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.vaultAddress).toBe(vaultAddress);
    expect(res.body.status).toBe('configuring');
  });
});

describe('PATCH /api/vaults/:ownerAddress/config — signature auth', () => {
  it('rejects a request with no signature', async () => {
    await Vault.create(makeVault());
    const res = await request(app)
      .patch(`/api/vaults/${ownerAddress}/config`)
      .send({ config: { maxExposureUsdt: 500 } });
    expect(res.status).toBe(401);
  });

  it('rejects a signature from a wallet that is not the owner', async () => {
    await Vault.create(makeVault());
    const attacker = ethers.Wallet.createRandom();
    const timestamp = Date.now();
    const signature = await signConfig(attacker, ownerAddress, timestamp);
    const res = await request(app)
      .patch(`/api/vaults/${ownerAddress}/config`)
      .send({ signature, timestamp, config: { maxExposureUsdt: 500 } });
    expect(res.status).toBe(401);
  });

  it('rejects an expired signature', async () => {
    await Vault.create(makeVault());
    const staleTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes old, past the 5-minute window
    const signature = await signConfig(owner, ownerAddress, staleTimestamp);
    const res = await request(app)
      .patch(`/api/vaults/${ownerAddress}/config`)
      .send({ signature, timestamp: staleTimestamp, config: { maxExposureUsdt: 500 } });
    expect(res.status).toBe(401);
  });

  it('accepts a valid, fresh signature from the owner and persists the config', async () => {
    await Vault.create(makeVault());
    const timestamp = Date.now();
    const signature = await signConfig(owner, ownerAddress, timestamp);
    const res = await request(app)
      .patch(`/api/vaults/${ownerAddress}/config`)
      .send({
        signature,
        timestamp,
        config: {
          maxExposureUsdt: 500,
          stopLossUsdt: 100,
          scope: [{ eventId: 'MATCH_001', outcomes: [0, 1] }],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.maxExposureUsdt).toBe(500);
    expect(res.body.stopLossUsdt).toBe(100);
    expect(res.body.status).toBe('configuring');
    expect(res.body.scope).toHaveLength(1);
    expect(res.body.scope[0]).toMatchObject({ eventId: 'MATCH_001', outcomes: [0, 1] });
  });

  it('cannot set status to "stopped" via this route — that is keeper-only', async () => {
    await Vault.create(makeVault());
    const timestamp = Date.now();
    const signature = await signConfig(owner, ownerAddress, timestamp);
    const res = await request(app)
      .patch(`/api/vaults/${ownerAddress}/config`)
      .send({ signature, timestamp, config: { status: 'stopped' } });
    expect(res.status).toBe(400);
  });

  it('a valid signature can only ever mutate the signer\'s own vault, never claim another owner\'s', async () => {
    // The route path itself is :ownerAddress — an attacker who signs correctly for
    // their OWN address cannot use that signature against someone else's path, because
    // verifyConfigSignature requires the recovered signer to equal the path's ownerAddress.
    await Vault.create(makeVault());
    const attacker = ethers.Wallet.createRandom();
    const timestamp = Date.now();
    const attackerSignature = await signConfig(attacker, attacker.address.toLowerCase(), timestamp);
    const res = await request(app)
      .patch(`/api/vaults/${ownerAddress}/config`) // targeting the real owner's vault
      .send({ signature: attackerSignature, timestamp, config: { maxExposureUsdt: 999999 } });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/vaults/:ownerAddress/config — activation gate', () => {
  async function tryActivate() {
    const timestamp = Date.now();
    const signature = await signConfig(owner, ownerAddress, timestamp);
    return request(app)
      .patch(`/api/vaults/${ownerAddress}/config`)
      .send({ signature, timestamp, config: { status: 'active' } });
  }

  it('refuses activation with neither agreement signed nor KYC approved', async () => {
    await Vault.create(makeVault());
    const res = await tryActivate();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Liquidity Provision Agreement/);
    expect(res.body.error).toMatch(/KYC/);
  });

  it('refuses activation with the agreement signed but KYC not approved', async () => {
    await Vault.create(makeVault({ agreementVersion: AGREEMENT_VERSION, kycStatus: 'pending' }));
    const res = await tryActivate();
    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/Liquidity Provision Agreement/);
    expect(res.body.error).toMatch(/KYC/);
  });

  it('refuses activation with KYC approved but the agreement not signed', async () => {
    await Vault.create(makeVault({ kycStatus: 'approved' }));
    const res = await tryActivate();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Liquidity Provision Agreement/);
  });

  it('allows activation once the agreement is signed and KYC is approved', async () => {
    await Vault.create(makeVault({ agreementVersion: AGREEMENT_VERSION, kycStatus: 'approved' }));
    const res = await tryActivate();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  it('kycRequestReview moves none -> pending but never downgrades an approved vault', async () => {
    await Vault.create(makeVault({ kycStatus: 'approved' }));
    const timestamp = Date.now();
    const signature = await signConfig(owner, ownerAddress, timestamp);
    const res = await request(app)
      .patch(`/api/vaults/${ownerAddress}/config`)
      .send({ signature, timestamp, config: { kycRequestReview: true } });
    expect(res.status).toBe(200);
    expect(res.body.kycStatus).toBe('approved'); // unchanged, not reset to 'pending'
  });
});

describe('PATCH /api/vaults/:ownerAddress/config — protocol treasury vault exemption', () => {
  afterEach(() => { delete process.env.PROTOCOL_TREASURY_ADDRESS; });

  it('allows activation without agreement/KYC when the owner is the configured treasury', async () => {
    process.env.PROTOCOL_TREASURY_ADDRESS = ownerAddress;
    await Vault.create(makeVault()); // no agreementVersion, kycStatus defaults to 'none'
    const timestamp = Date.now();
    const signature = await signConfig(owner, ownerAddress, timestamp);
    const res = await request(app)
      .patch(`/api/vaults/${ownerAddress}/config`)
      .send({ signature, timestamp, config: { status: 'active' } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  it('still enforces the gate for a different owner even when a treasury address is set', async () => {
    process.env.PROTOCOL_TREASURY_ADDRESS = '0x' + '5'.repeat(40); // not this owner
    await Vault.create(makeVault());
    const timestamp = Date.now();
    const signature = await signConfig(owner, ownerAddress, timestamp);
    const res = await request(app)
      .patch(`/api/vaults/${ownerAddress}/config`)
      .send({ signature, timestamp, config: { status: 'active' } });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/vaults/:ownerAddress/agreement', () => {
  it('rejects an invalid signature', async () => {
    await Vault.create(makeVault());
    const res = await request(app)
      .post(`/api/vaults/${ownerAddress}/agreement`)
      .send({ signature: '0xnotasignature', timestamp: Date.now() });
    expect(res.status).toBe(401);
  });

  it('rejects a signature from a wallet that is not the owner', async () => {
    await Vault.create(makeVault());
    const attacker = ethers.Wallet.createRandom();
    const timestamp = Date.now();
    const signature = await signAgreement(attacker, ownerAddress, timestamp);
    const res = await request(app)
      .post(`/api/vaults/${ownerAddress}/agreement`)
      .send({ signature, timestamp });
    expect(res.status).toBe(401);
  });

  it('accepts a valid EIP-712 signature and records the agreement version', async () => {
    await Vault.create(makeVault());
    const timestamp = Date.now();
    const signature = await signAgreement(owner, ownerAddress, timestamp);
    const res = await request(app)
      .post(`/api/vaults/${ownerAddress}/agreement`)
      .send({ signature, timestamp });
    expect(res.status).toBe(200);
    expect(res.body.agreementVersion).toBe(AGREEMENT_VERSION);
    expect(res.body.agreementSignedAt).toBeTruthy();
  });
});

describe('GET /api/vaults/:ownerAddress/offers', () => {
  it('returns offers filtered by the vault address, not the owner address', async () => {
    await Vault.create(makeVault());
    await Order.insertMany([
      { offerId: 1, placer: vaultAddress, eventId: 'MATCH_001', outcome: 0, odds: 25000, oddsDecimal: 2.5, liability: USDT(100), remainingLiability: USDT(100), active: true },
      { offerId: 2, placer: '0xdeadbeef', eventId: 'MATCH_001', outcome: 0, odds: 20000, oddsDecimal: 2.0, liability: USDT(50), remainingLiability: USDT(50), active: true },
    ]);
    const res = await request(app).get(`/api/vaults/${ownerAddress}/offers`);
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].offerId).toBe(1);
  });
});

describe('GET /api/vaults/:ownerAddress/pnl', () => {
  it('computes realized P&L from settled BetMatch records', async () => {
    await Vault.create(makeVault());
    await BetMatch.insertMany([
      // Bettor lost (settledOutcome !== outcome) — vault (placer) wins the stake.
      { matchId: 1, offerId: 1, placer: vaultAddress, bettor: '0xbb', eventId: 'E1', outcome: 0, odds: 20000, bettorStake: USDT(50), placerLiability: USDT(50), settled: true, settledOutcome: 1 },
      // Bettor won (settledOutcome === outcome) — vault pays out its liability.
      { matchId: 2, offerId: 2, placer: vaultAddress, bettor: '0xcc', eventId: 'E2', outcome: 0, odds: 20000, bettorStake: USDT(30), placerLiability: USDT(30), settled: true, settledOutcome: 0 },
    ]);
    const res = await request(app).get(`/api/vaults/${ownerAddress}/pnl`);
    expect(res.status).toBe(200);
    expect(res.body.realizedPnlUsdt).toBe(20); // +50 (won) - 30 (lost) = 20
    expect(res.body.matchesSettled).toBe(2);
  });
});
