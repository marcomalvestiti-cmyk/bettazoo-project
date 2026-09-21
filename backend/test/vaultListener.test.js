const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const Vault = require('../src/models/Vault');
const { handleVaultCreated } = require('../src/services/vaultListener');

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

const OWNER = '0xa4c486cEaff47a130057BD624dCd265Fa66f3284';
const VAULT_A = '0x95ed18ac6a22cad5165092c2015a257a59be60e8';
const VAULT_B = '0xD88f95f2dAA2567101c835F6ba3e48b3DbA88804';

describe('handleVaultCreated', () => {
  it('creates a fresh Vault doc with schema defaults for a brand-new owner', async () => {
    await handleVaultCreated(OWNER, VAULT_A, '0xtx1', 100);

    const doc = await Vault.findOne({ ownerAddress: OWNER.toLowerCase() }).lean();
    expect(doc.vaultAddress).toBe(VAULT_A.toLowerCase());
    expect(doc.status).toBe('configuring');
    expect(doc.strategy.marginStrategyId).toBe('balanced'); // schema default
  });

  it('repoints the existing doc to a second vault for the same owner, preserving preferences (post-redeploy migration)', async () => {
    await handleVaultCreated(OWNER, VAULT_A, '0xtx1', 100);
    await Vault.findOneAndUpdate(
      { ownerAddress: OWNER.toLowerCase() },
      {
        status: 'active',
        'strategy.marginStrategyId': 'safe',
        agreementVersion: 1,
        kycStatus: 'approved',
        feeOverridePercent: 20,
        hasFeeOverride: true,
      }
    );

    await handleVaultCreated(OWNER, VAULT_B, '0xtx2', 200);

    const docs = await Vault.find({ ownerAddress: OWNER.toLowerCase() }).lean();
    expect(docs).toHaveLength(1); // never a second, colliding document
    const doc = docs[0];
    expect(doc.vaultAddress).toBe(VAULT_B.toLowerCase());
    expect(doc.createdAtTx).toBe('0xtx2');
    expect(doc.createdAtBlock).toBe(200);
    // Instance-specific fields reset — the new clone has no on-chain cap yet.
    expect(doc.status).toBe('configuring');
    expect(doc.onChainPaused).toBe(false);
    expect(doc.feeOverridePercent).toBeNull();
    expect(doc.hasFeeOverride).toBe(false);
    // Owner-level preferences carry over untouched.
    expect(doc.strategy.marginStrategyId).toBe('safe');
    expect(doc.agreementVersion).toBe(1);
    expect(doc.kycStatus).toBe('approved');
  });
});
