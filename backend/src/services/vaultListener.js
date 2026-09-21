const { ethers } = require('ethers')
const mongoose = require('mongoose')
const Vault = require('../models/Vault')

// Reuses the same 'syncstate' collection web3Listener.js writes to (different _id), so
// a reconnect resumes from where it left off instead of rescanning full history every
// time — same rationale as the Escrow listener's SyncState.
const SyncState = mongoose.models.SyncState ?? mongoose.model(
  'SyncState',
  new mongoose.Schema(
    { _id: String, lastBlock: { type: Number, default: 0 } },
    { collection: 'syncstate' }
  )
)

async function getLastSyncedVaultBlock() {
  try {
    const doc = await SyncState.findById('vaults').lean()
    return doc?.lastBlock ?? FACTORY_DEPLOY_BLOCK
  } catch (err) {
    console.warn(`[${ts()}] [VaultListener] Could not read lastSyncedBlock: ${err.message}`)
    return FACTORY_DEPLOY_BLOCK
  }
}

async function saveLastSyncedVaultBlock(blockNumber) {
  try {
    await SyncState.findByIdAndUpdate('vaults', { lastBlock: blockNumber }, { upsert: true })
  } catch (err) {
    console.warn(`[${ts()}] [VaultListener] Could not save lastSyncedBlock: ${err.message}`)
  }
}

// PlacerVaultFactory: a single, known contract address — regular address-scoped listening.
const FACTORY_ABI = [
  'event VaultCreated(address indexed owner, address indexed vault)',
]

// PlacerVault clone events: every vault is a separate contract address (EIP-1167 clones
// of the same implementation), so these are tracked by event *topic* across all
// addresses rather than one contract instance per vault — see handleVaultLog below for
// how spoofing from unrelated contracts is rejected.
const VAULT_EVENTS_ABI = [
  'event Deposited(address indexed from, uint256 amount)',
  'event Withdrawn(address indexed to, uint256 amount)',
  'event Paused(address indexed by)',
  'event Unpaused(address indexed by)',
  'event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper)',
]

const vaultInterface = new ethers.Interface(VAULT_EVENTS_ABI)
const VAULT_TOPICS = [
  ethers.id('Deposited(address,uint256)'),
  ethers.id('Withdrawn(address,uint256)'),
  ethers.id('Paused(address)'),
  ethers.id('Unpaused(address)'),
  ethers.id('KeeperUpdated(address,address)'),
]
const VAULT_CREATED_TOPIC = ethers.id('VaultCreated(address,address)')

const CHUNK_SIZE = parseInt(process.env.ESCROW_CHUNK_SIZE ?? '2000')
const FACTORY_DEPLOY_BLOCK = parseInt(process.env.VAULT_FACTORY_DEPLOY_BLOCK ?? '0')
// Small pause between chunks so a large historical backfill doesn't fire requests
// back-to-back on top of the Escrow listener's own real-time polling on the same
// shared public RPC — that combination was tripping sustained 429s.
const CHUNK_DELAY_MS = parseInt(process.env.VAULT_CHUNK_DELAY_MS ?? '300')

function ts() { return new Date().toISOString() }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// In-memory set of known vault addresses (lowercase). Populated from Mongo at startup
// and kept live as new vaults are created. Vault-event logs are checked against this
// set before being trusted — since those events are topic-matched across ALL contract
// addresses (not scoped to a specific instance), an unrelated contract emitting a
// same-signature event could otherwise pollute vault data.
const knownVaults = new Set()

async function loadKnownVaults() {
  const vaults = await Vault.find({}, 'vaultAddress').lean()
  for (const v of vaults) knownVaults.add(v.vaultAddress)
  console.log(`[${ts()}] [VaultListener] Loaded ${knownVaults.size} known vault address(es) from DB`)
}

// Keyed by ownerAddress (not vaultAddress) because Vault.ownerAddress is unique — an
// owner can only ever hold one Vault doc. Normally that's also their only vault ever
// (the factory's own createVault() forbids a second one), but after an Escrow/Factory
// redeploy (e.g. the Vigorish-per-vault migration, 2026-09-21) an owner can get a
// second VaultCreated on the NEW factory. Upserting by vaultAddress there would insert
// a second doc and collide with the ownerAddress unique index (silent failure — the
// event gets dropped, backend keeps pointing at the stale vault indefinitely). Keying
// by ownerAddress instead repoints the existing doc: strategy/scope/agreement/kycStatus
// carry over (owner-level preferences, not contract-instance-level), only the
// instance-specific fields reset — status to 'configuring' because a fresh vault clone
// always starts with maxSingleOfferLiability=0, and the product's own activation gate
// requires that cap before going active again.
async function handleVaultCreated(owner, vault, txHash, blockNumber) {
  const vaultAddr = vault.toLowerCase()
  knownVaults.add(vaultAddr)
  await Vault.findOneAndUpdate(
    { ownerAddress: owner.toLowerCase() },
    {
      $set: {
        vaultAddress:       vaultAddr,
        status:             'configuring',
        onChainPaused:      false,
        feeOverridePercent: null,
        hasFeeOverride:     false,
        createdAtTx:        txHash,
        createdAtBlock:     blockNumber,
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  )
  console.log(`[${ts()}] [VaultCreated] owner=${owner} vault=${vault}`)
}

async function handleVaultLog(log) {
  const addr = log.address.toLowerCase()
  if (!knownVaults.has(addr)) return // reject: not a vault we created via the factory

  let parsed
  try {
    parsed = vaultInterface.parseLog(log)
  } catch {
    return // topic matched but payload didn't decode — ignore
  }

  switch (parsed.name) {
    case 'Paused':
      await Vault.findOneAndUpdate({ vaultAddress: addr }, { onChainPaused: true })
      break
    case 'Unpaused':
      await Vault.findOneAndUpdate({ vaultAddress: addr }, { onChainPaused: false })
      break
    case 'KeeperUpdated':
      await Vault.findOneAndUpdate({ vaultAddress: addr }, { keeperAddress: parsed.args.newKeeper.toLowerCase() })
      break
    // Deposited/Withdrawn don't flip any Vault-doc state — balance is read on demand via
    // the vault's own balance() view — so there's nothing to persist here beyond the log
    // itself reaching the socket subscribers below.
  }
}

async function processLogsInChunks(provider, filterBase, fromBlock, toBlock, onChunk) {
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock)
    try {
      const logs = await provider.getLogs({ ...filterBase, fromBlock: start, toBlock: end })
      if (logs.length > 0) await onChunk(logs)
    } catch (err) {
      console.warn(`[${ts()}] [VaultListener] chunk ${start}-${end} failed: ${err.message}`)
    }
    if (end < toBlock) await sleep(CHUNK_DELAY_MS)
  }
}

async function syncHistoricalVaultEvents(provider, factoryAddress) {
  const toBlock = await provider.getBlockNumber()
  const fromBlock = await getLastSyncedVaultBlock()

  if (fromBlock >= toBlock) {
    console.log(`[${ts()}] [VaultListener] Already up to date at block ${toBlock}`)
    return
  }

  console.log(`[${ts()}] [VaultListener] Historical sync: blocks ${fromBlock}-${toBlock}`)

  // Pass 1: VaultCreated on the factory — populates knownVaults. Must run before Pass 2,
  // since Pass 2 rejects any log whose address isn't in that set yet.
  const factoryInterface = new ethers.Interface(FACTORY_ABI)
  let createdCount = 0
  await processLogsInChunks(
    provider,
    { address: factoryAddress, topics: [VAULT_CREATED_TOPIC] },
    fromBlock, toBlock,
    async (logs) => {
      for (const log of logs) {
        const parsed = factoryInterface.parseLog(log)
        await handleVaultCreated(parsed.args.owner, parsed.args.vault, log.transactionHash, log.blockNumber)
        createdCount++
      }
    }
  )

  await sleep(2_000) // breathe before next pass to avoid 429 bursts

  // Pass 2: vault clone events, any address, filtered against knownVaults.
  let vaultLogCount = 0
  await processLogsInChunks(
    provider,
    { topics: [VAULT_TOPICS] },
    fromBlock, toBlock,
    async (logs) => {
      for (const log of logs) {
        await handleVaultLog(log)
        vaultLogCount++
      }
    }
  )

  await saveLastSyncedVaultBlock(toBlock)
  console.log(`[${ts()}] [VaultListener] Historical sync done: ${createdCount} vault(s) created, ${vaultLogCount} vault event(s) processed`)
}

/**
 * @param {ethers.Provider} provider
 * @param {string}          factoryAddress
 * @param {object}          io - Socket.IO server (may be null)
 * @param {boolean}         skipHistoricalSync - true on reconnect (DB already populated)
 */
async function startVaultListener(provider, factoryAddress, io, skipHistoricalSync = false) {
  await loadKnownVaults()
  if (skipHistoricalSync) {
    console.log(`[${ts()}] [VaultListener] Historical sync skipped — reconnect mode`)
  } else {
    await syncHistoricalVaultEvents(provider, factoryAddress)
  }

  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider)

  factory.on('VaultCreated', async (owner, vault, ev) => {
    try {
      await handleVaultCreated(owner, vault, ev.log.transactionHash, ev.log.blockNumber)
      io?.emit('vault:created', { owner, vault })
    } catch (err) {
      console.error(`[${ts()}] [VaultCreated] error: ${err.message}`)
    }
  })

  provider.on({ topics: [VAULT_TOPICS] }, async (log) => {
    try {
      await handleVaultLog(log)
      const addr = log.address.toLowerCase()
      if (knownVaults.has(addr)) io?.emit('vault:updated', { vault: addr })
    } catch (err) {
      console.error(`[${ts()}] [VaultListener] log error: ${err.message}`)
    }
  })

  console.log(`[${ts()}] [VaultListener] Real-time subscriptions active (factory=${factoryAddress})`)
}

module.exports = { startVaultListener, syncHistoricalVaultEvents, handleVaultCreated }
