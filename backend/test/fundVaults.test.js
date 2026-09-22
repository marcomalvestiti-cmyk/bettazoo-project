const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request  = require('supertest');
const { ethers } = require('ethers');
const app      = require('../src/app');
const FundVault = require('../src/models/FundVault');
const FundVaultLP = require('../src/models/FundVaultLP');
const fundVaultsRouter = require('../src/routes/fundVaults');
const vaultsRouter = require('../src/routes/vaults');
const { AGREEMENT_VERSION, AGREEMENT_DOMAIN, AGREEMENT_TYPES } = require('../src/services/agreement');
const { FUND_AGREEMENT_VERSION, FUND_AGREEMENT_DOMAIN, FUND_AGREEMENT_TYPES } = require('../src/services/fundAgreement');

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
  await FundVault.deleteMany({});
  await FundVaultLP.deleteMany({});
});

const owner = ethers.Wallet.createRandom();
const ownerAddress = owner.address.toLowerCase();
const fundVaultAddress = '0x' + '9'.repeat(40);
const lp = ethers.Wallet.createRandom();
const lpAddress = lp.address.toLowerCase();

async function signConfig(signer, address, timestamp) {
  const message = fundVaultsRouter.buildFundVaultSignMessage(address, timestamp);
  return signer.signMessage(message);
}

async function signVaultConfig(signer, address, timestamp) {
  // Deliberately using routes/vaults.js's own message builder, to prove cross-domain
  // signature isolation below.
  const message = vaultsRouter.buildSignMessage(address, timestamp);
  return signer.signMessage(message);
}

async function signAgreement(signer, address, timestamp, version = AGREEMENT_VERSION) {
  const value = { owner: address, version, timestamp };
  return signer.signTypedData(AGREEMENT_DOMAIN, AGREEMENT_TYPES, value);
}

async function signFundAgreement(signer, vaultAddr, lpAddr, timestamp, version = FUND_AGREEMENT_VERSION) {
  const value = { fundVault: vaultAddr, lp: lpAddr, version, timestamp };
  return signer.signTypedData(FUND_AGREEMENT_DOMAIN, FUND_AGREEMENT_TYPES, value);
}

function makeFundVault(overrides = {}) {
  return {
    ownerAddress,
    fundVaultAddress,
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

describe('GET /api/fund-vaults/:ownerAddress', () => {
  it('returns exists:false when no fund vault has been created for this owner', async () => {
    const res = await request(app).get(`/api/fund-vaults/${ownerAddress}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
  });

  it('returns the fund vault config when one exists', async () => {
    await FundVault.create(makeFundVault());
    const res = await request(app).get(`/api/fund-vaults/${ownerAddress}`);
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.fundVaultAddress).toBe(fundVaultAddress);
    expect(res.body.status).toBe('configuring');
  });
});

describe('PATCH /api/fund-vaults/:ownerAddress/config — signature auth', () => {
  it('rejects a request with no signature', async () => {
    await FundVault.create(makeFundVault());
    const res = await request(app)
      .patch(`/api/fund-vaults/${ownerAddress}/config`)
      .send({ config: { maxExposureUsdt: 500 } });
    expect(res.status).toBe(401);
  });

  it('rejects a signature from a wallet that is not the owner', async () => {
    await FundVault.create(makeFundVault());
    const attacker = ethers.Wallet.createRandom();
    const timestamp = Date.now();
    const signature = await signConfig(attacker, ownerAddress, timestamp);
    const res = await request(app)
      .patch(`/api/fund-vaults/${ownerAddress}/config`)
      .send({ signature, timestamp, config: { maxExposureUsdt: 500 } });
    expect(res.status).toBe(401);
  });

  it('a signature valid for the single-owner vault config route does NOT satisfy the fund vault route (different message text)', async () => {
    await FundVault.create(makeFundVault());
    const timestamp = Date.now();
    const signature = await signVaultConfig(owner, ownerAddress, timestamp);
    const res = await request(app)
      .patch(`/api/fund-vaults/${ownerAddress}/config`)
      .send({ signature, timestamp, config: { maxExposureUsdt: 500 } });
    expect(res.status).toBe(401);
  });

  it('accepts a valid, fresh signature from the owner and persists the config', async () => {
    await FundVault.create(makeFundVault());
    const timestamp = Date.now();
    const signature = await signConfig(owner, ownerAddress, timestamp);
    const res = await request(app)
      .patch(`/api/fund-vaults/${ownerAddress}/config`)
      .send({
        signature,
        timestamp,
        config: { maxExposureUsdt: 500, scope: [{ eventId: 'MATCH_001', outcomes: [0, 1] }] },
      });
    expect(res.status).toBe(200);
    expect(res.body.maxExposureUsdt).toBe(500);
    expect(res.body.scope[0]).toMatchObject({ eventId: 'MATCH_001', outcomes: [0, 1] });
  });
});

describe('PATCH /api/fund-vaults/:ownerAddress/config — manager activation gate', () => {
  async function tryActivate() {
    const timestamp = Date.now();
    const signature = await signConfig(owner, ownerAddress, timestamp);
    return request(app)
      .patch(`/api/fund-vaults/${ownerAddress}/config`)
      .send({ signature, timestamp, config: { status: 'active' } });
  }

  it('refuses activation with neither agreement signed nor KYC approved', async () => {
    await FundVault.create(makeFundVault());
    const res = await tryActivate();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Liquidity Provision Agreement/);
    expect(res.body.error).toMatch(/KYC/);
  });

  it('allows activation once the manager\'s agreement is signed and KYC is approved', async () => {
    await FundVault.create(makeFundVault({ agreementVersion: AGREEMENT_VERSION, kycStatus: 'approved' }));
    const res = await tryActivate();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });
});

describe('POST /api/fund-vaults/:ownerAddress/agreement — manager side', () => {
  it('rejects an invalid signature', async () => {
    await FundVault.create(makeFundVault());
    const res = await request(app)
      .post(`/api/fund-vaults/${ownerAddress}/agreement`)
      .send({ signature: '0xbad', timestamp: Date.now() });
    expect(res.status).toBe(401);
  });

  it('records a valid agreement signature, reusing the same AGREEMENT_VERSION as the single-owner vault', async () => {
    await FundVault.create(makeFundVault());
    const timestamp = Date.now();
    const signature = await signAgreement(owner, ownerAddress, timestamp);
    const res = await request(app)
      .post(`/api/fund-vaults/${ownerAddress}/agreement`)
      .send({ signature, timestamp });
    expect(res.status).toBe(200);
    expect(res.body.agreementVersion).toBe(AGREEMENT_VERSION);
    expect(res.body.agreementSignedAt).toBeTruthy();
  });
});

describe('LP compliance endpoints', () => {
  beforeEach(async () => {
    await FundVault.create(makeFundVault());
  });

  it('POST .../lp/:lpAddress/agreement rejects an invalid signature', async () => {
    const res = await request(app)
      .post(`/api/fund-vaults/${ownerAddress}/lp/${lpAddress}/agreement`)
      .send({ signature: '0xbad', timestamp: Date.now() });
    expect(res.status).toBe(401);
  });

  it('POST .../lp/:lpAddress/agreement records the LP\'s own Fund Participation Agreement', async () => {
    const timestamp = Date.now();
    const signature = await signFundAgreement(lp, fundVaultAddress, lpAddress, timestamp);
    const res = await request(app)
      .post(`/api/fund-vaults/${ownerAddress}/lp/${lpAddress}/agreement`)
      .send({ signature, timestamp });
    expect(res.status).toBe(200);
    expect(res.body.agreementVersion).toBe(FUND_AGREEMENT_VERSION);
    expect(res.body.approved).toBe(false); // on-chain allowlist is a separate, manager-set step

    const doc = await FundVaultLP.findOne({ fundVaultAddress, lpAddress }).lean();
    expect(doc.agreementSignature).toBe(signature);
  });

  it('a Fund Participation Agreement signed for a different fund vault does not satisfy this one', async () => {
    const otherVaultAddress = '0x' + '7'.repeat(40);
    const timestamp = Date.now();
    const signature = await signFundAgreement(lp, otherVaultAddress, lpAddress, timestamp);
    const res = await request(app)
      .post(`/api/fund-vaults/${ownerAddress}/lp/${lpAddress}/agreement`)
      .send({ signature, timestamp });
    expect(res.status).toBe(401);
  });

  it('POST .../lp/:lpAddress/kyc-request moves none -> pending, never downgrades approved', async () => {
    const res1 = await request(app).post(`/api/fund-vaults/${ownerAddress}/lp/${lpAddress}/kyc-request`).send({});
    expect(res1.status).toBe(200);
    expect(res1.body.kycStatus).toBe('pending');

    await FundVaultLP.findOneAndUpdate({ fundVaultAddress, lpAddress }, { kycStatus: 'approved' });
    const res2 = await request(app).post(`/api/fund-vaults/${ownerAddress}/lp/${lpAddress}/kyc-request`).send({});
    expect(res2.status).toBe(200);
    expect(res2.body.kycStatus).toBe('approved'); // untouched
  });

  it('GET .../lps lists LP compliance records for the manager\'s allowlist UI', async () => {
    await FundVaultLP.create({ fundVaultAddress, lpAddress, approved: true, kycStatus: 'approved' });
    const res = await request(app).get(`/api/fund-vaults/${ownerAddress}/lps`);
    expect(res.status).toBe(200);
    expect(res.body.lps).toHaveLength(1);
    expect(res.body.lps[0]).toMatchObject({ lpAddress, approved: true, kycStatus: 'approved' });
  });
});
