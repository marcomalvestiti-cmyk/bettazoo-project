const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const FundVault = require('../src/models/FundVault');
const { handleFundVaultCreated } = require('../src/services/fundVaultListener');

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
});

const OWNER = '0xa4c486cEaff47a130057BD624dCd265Fa66f3284';
const VAULT_A = '0x95ed18ac6a22cad5165092c2015a257a59be60e8';
const VAULT_B = '0xD88f95f2dAA2567101c835F6ba3e48b3DbA88804';

describe('handleFundVaultCreated', () => {
  it('creates a fresh FundVault doc with schema defaults for a brand-new owner', async () => {
    await handleFundVaultCreated(OWNER, VAULT_A, '0xtx1', 100);

    const doc = await FundVault.findOne({ ownerAddress: OWNER.toLowerCase() }).lean();
    expect(doc.fundVaultAddress).toBe(VAULT_A.toLowerCase());
    expect(doc.status).toBe('configuring');
    expect(doc.strategy.marginStrategyId).toBe('balanced'); // schema default
  });

  it('repoints the existing doc to a second fund vault for the same owner (same redeploy-safety pattern as Vault)', async () => {
    await handleFundVaultCreated(OWNER, VAULT_A, '0xtx1', 100);
    await FundVault.findOneAndUpdate(
      { ownerAddress: OWNER.toLowerCase() },
      { status: 'active', 'strategy.marginStrategyId': 'safe', agreementVersion: 1, kycStatus: 'approved' }
    );

    await handleFundVaultCreated(OWNER, VAULT_B, '0xtx2', 200);

    const docs = await FundVault.find({ ownerAddress: OWNER.toLowerCase() }).lean();
    expect(docs).toHaveLength(1);
    const doc = docs[0];
    expect(doc.fundVaultAddress).toBe(VAULT_B.toLowerCase());
    expect(doc.status).toBe('configuring'); // instance-specific field reset
    expect(doc.onChainPaused).toBe(false);
    expect(doc.strategy.marginStrategyId).toBe('safe'); // owner-level preference carries over
    expect(doc.agreementVersion).toBe(1);
    expect(doc.kycStatus).toBe('approved');
  });
});
