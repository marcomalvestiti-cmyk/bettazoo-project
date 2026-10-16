const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const { createLogPoller } = require('../src/services/logPoller');
const { handleEscrowLogs, ESCROW_ABI } = require('../src/services/web3Listener');
const Order = require('../src/models/Order');

let mongod;
let SyncState;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  SyncState = mongoose.models.SyncState;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await SyncState.deleteMany({});
  await Order.deleteMany({});
});

// Records every getLogs call; `failOn(call)` lets a test make a specific call throw.
function fakeProvider(head, { failOn } = {}) {
  const calls = [];
  return {
    calls,
    head,
    async getBlockNumber() { return this.head; },
    async getLogs(filter) {
      calls.push(filter);
      if (failOn?.(filter, calls.length)) throw new Error('429 Too Many Requests');
      return [{ blockNumber: filter.toBlock, label: filter.address }];
    },
  };
}

function source(label, seen) {
  return { label, filter: { address: label }, onLogs: async (logs) => { seen.push(...logs.map((l) => `${l.label}@${l.blockNumber}`)); } };
}

describe('logPoller', () => {
  it('resumes from the lowest SyncState, queries each source once per chunk in order, and persists progress', async () => {
    await SyncState.create([{ _id: 'web3', lastBlock: 100 }, { _id: 'vaults', lastBlock: 90 }]);
    const provider = fakeProvider(120);
    const seen = [];
    const poller = createLogPoller({
      provider, sources: [source('factory', seen), source('vaults', seen)],
      syncStateIds: ['web3', 'vaults'], chunkSize: 20, chunkDelayMs: 0,
    });

    await poller.tick();

    // 91..120 in chunks of 20 → [91-110], [111-120]; two sources per chunk, factory first
    expect(provider.calls.map((c) => `${c.address}:${c.fromBlock}-${c.toBlock}`)).toEqual([
      'factory:91-110', 'vaults:91-110', 'factory:111-120', 'vaults:111-120',
    ]);
    expect(seen).toEqual(['factory@110', 'vaults@110', 'factory@120', 'vaults@120']);
    expect(poller.getLastBlock()).toBe(120);
    const docs = await SyncState.find().sort({ _id: 1 }).lean();
    expect(docs.map((d) => d.lastBlock)).toEqual([120, 120]);
  });

  it('does nothing extra when no new blocks — one getBlockNumber, zero getLogs', async () => {
    await SyncState.create({ _id: 'web3', lastBlock: 50 });
    const provider = fakeProvider(50);
    const poller = createLogPoller({ provider, sources: [source('escrow', [])], syncStateIds: ['web3'], chunkDelayMs: 0 });

    await poller.tick();

    expect(provider.calls).toHaveLength(0);
    expect(poller.getLastBlock()).toBe(50);
  });

  it('does not advance past a chunk where any source failed, and retries that range next tick', async () => {
    await SyncState.create({ _id: 'web3', lastBlock: 0 });
    let fail = true;
    const provider = fakeProvider(30, { failOn: (f) => fail && f.address === 'b' && f.fromBlock === 11 });
    const poller = createLogPoller({
      provider, sources: [source('a', []), source('b', [])],
      syncStateIds: ['web3'], chunkSize: 10, chunkDelayMs: 0,
    });

    await poller.tick();
    expect(poller.getLastBlock()).toBe(10); // chunk 1-10 done, 11-20 failed on source b
    expect((await SyncState.findById('web3').lean()).lastBlock).toBe(10);

    fail = false;
    provider.calls.length = 0;
    await poller.tick();
    expect(provider.calls[0]).toMatchObject({ address: 'a', fromBlock: 11, toBlock: 20 });
    expect(poller.getLastBlock()).toBe(30);
  });

  it('starts from the chain head when no SyncState exists yet (no full-history scan)', async () => {
    const provider = fakeProvider(5000);
    const poller = createLogPoller({ provider, sources: [source('escrow', [])], syncStateIds: ['web3'], chunkDelayMs: 0 });

    await poller.tick();

    expect(provider.calls).toHaveLength(0);
    expect(poller.getLastBlock()).toBe(5000);
  });
});

describe('handleEscrowLogs', () => {
  const ESCROW = '0xD01D7Af6eB42968DdE249cD56ab382F2eF7fF04D';
  const PLACER = '0x95ed18ac6a22cad5165092c2015a257a59be60e8';
  const contract = new ethers.Contract(ESCROW, ESCROW_ABI);

  function encodedLog(name, values, blockNumber) {
    const { data, topics } = contract.interface.encodeEventLog(name, values);
    return { address: ESCROW, data, topics, blockNumber, transactionHash: '0x' + 'ab'.repeat(32), index: 0 };
  }

  it('decodes a raw OfferCreated log and indexes the Order + emits offer:created', async () => {
    const emitted = [];
    const io = { emit: (ev, payload) => emitted.push([ev, payload]) };
    const log = encodedLog('OfferCreated', [7n, PLACER, 'serie-a-001', 1, 25000n, 25_000_000n], 1234);

    await handleEscrowLogs([log], contract, io);

    const order = await Order.findOne({ offerId: 7 }).lean();
    expect(order).toMatchObject({
      placer: PLACER, eventId: 'serie-a-001', outcome: 1, odds: 25000, oddsDecimal: 2.5,
      liability: '25000000', remainingLiability: '25000000', active: true, blockNumber: 1234,
    });
    expect(emitted).toEqual([['offer:created', expect.objectContaining({ offerId: 7, eventId: 'serie-a-001' })]]);
  });

  it('skips Escrow events with no handler (WinningsPaid) without throwing', async () => {
    const log = encodedLog('WinningsPaid', [PLACER, 1n], 1);
    await expect(handleEscrowLogs([log], contract, null)).resolves.toBeUndefined();
  });
});
