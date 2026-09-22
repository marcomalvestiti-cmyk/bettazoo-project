const { ethers } = require('ethers')
const mongoose = require('mongoose')
const FundVault = require('../models/FundVault')
const FundVaultLP = require('../models/FundVaultLP')

// Same SyncState collection as web3Listener.js/vaultListener.js, own _id so each
// listener's progress is tracked independently.
const SyncState = mongoose.models.SyncState ?? mongoose.model(
  'SyncState',
  new mongoose.Schema(
    { _id: String, lastBlock: { type: Number, default: 0 } },
    { collection: 'syncstate' }
  )
)

async function getLastSyncedBlock() {
  try {
    const doc = await SyncState.findById('fundVaults').lean()
    return doc?.lastBlock ?? FACTORY_DEPLOY_BLOCK
  } catch (err) {
    console.warn(`[${ts()}] [FundVaultListener] Could not read lastSyncedBlock: ${err.message}`)
    return FACTORY_DEPLOY_BLOCK
  }
}

async function saveLastSyncedBlock(blockNumber) {
  try {
    await SyncState.findByIdAndUpdate('fundVaults', { lastBlock: blockNumber }, { upsert: true })
  } catch (err) {
    console.warn(`[${ts()}] [FundVaultListener] Could not save lastSyncedBlock: ${err.message}`)
  }
}

const FACTORY_ABI = [
  'event FundVaultCreated(address indexed owner, address indexed vault)',
]

// PlacerFundVault clone events — same cross-address topic-matching pattern as
// vaultListener.js (every fund vault is a separate EIP-1167 clone address), checked
// against knownFundVaults before being trusted.
const FUND_VAULT_EVENTS_ABI = [
  'event Paused(address indexed by)',
  'event Unpaused(address indexed by)',
  'event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper)',
  'event ApprovedLPUpdated(address indexed lp, bool approved)',
  'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
  'event FeesCrystallized(uint256 placerShares, uint256 platformShares, uint256 newHighWaterMark)',
  'event SettlementReported(uint256 indexed offerId, uint256 resolvedAmount)',
]

const fundVaultInterface = new ethers.Interface(FUND_VAULT_EVENTS_ABI)
const FUND_VAULT_TOPICS = [
  ethers.id('Paused(address)'),
  ethers.id('Unpaused(address)'),
  ethers.id('KeeperUpdated(address,address)'),
  ethers.id('ApprovedLPUpdated(address,bool)'),
  ethers.id('Deposit(address,address,uint256,uint256)'),
  ethers.id('Withdraw(address,address,address,uint256,uint256)'),
  ethers.id('FeesCrystallized(uint256,uint256,uint256)'),
  ethers.id('SettlementReported(uint256,uint256)'),
]
const FUND_VAULT_CREATED_TOPIC = ethers.id('FundVaultCreated(address,address)')

const CHUNK_SIZE = parseInt(process.env.ESCROW_CHUNK_SIZE ?? '2000')
const FACTORY_DEPLOY_BLOCK = parseInt(process.env.FUND_VAULT_FACTORY_DEPLOY_BLOCK ?? '0')
const CHUNK_DELAY_MS = parseInt(process.env.VAULT_CHUNK_DELAY_MS ?? '300')

function ts() { return new Date().toISOString() }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const knownFundVaults = new Set()

async function loadKnownFundVaults() {
  const vaults = await FundVault.find({}, 'fundVaultAddress').lean()
  for (const v of vaults) knownFundVaults.add(v.fundVaultAddress)
  console.log(`[${ts()}] [FundVaultListener] Loaded ${knownFundVaults.size} known fund vault address(es) from DB`)
}

async function handleFundVaultCreated(owner, vault, txHash, blockNumber) {
  const vaultAddr = vault.toLowerCase()
  knownFundVaults.add(vaultAddr)
  await FundVault.findOneAndUpdate(
    { ownerAddress: owner.toLowerCase() },
    {
      $set: {
        fundVaultAddress: vaultAddr,
        status:           'configuring',
        onChainPaused:    false,
        createdAtTx:      txHash,
        createdAtBlock:   blockNumber,
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  )
  console.log(`[${ts()}] [FundVaultCreated] owner=${owner} vault=${vault}`)
}

async function handleFundVaultLog(log) {
  const addr = log.address.toLowerCase()
  if (!knownFundVaults.has(addr)) return // reject: not a fund vault we created via the factory

  let parsed
  try {
    parsed = fundVaultInterface.parseLog(log)
  } catch {
    return
  }

  switch (parsed.name) {
    case 'Paused':
      await FundVault.findOneAndUpdate({ fundVaultAddress: addr }, { onChainPaused: true })
      break
    case 'Unpaused':
      await FundVault.findOneAndUpdate({ fundVaultAddress: addr }, { onChainPaused: false })
      break
    case 'KeeperUpdated':
      await FundVault.findOneAndUpdate({ fundVaultAddress: addr }, { keeperAddress: parsed.args.newKeeper.toLowerCase() })
      break
    case 'ApprovedLPUpdated':
      await FundVaultLP.findOneAndUpdate(
        { fundVaultAddress: addr, lpAddress: parsed.args.lp.toLowerCase() },
        { $set: { approved: parsed.args.approved } },
        { upsert: true, setDefaultsOnInsert: true }
      )
      break
    // Deposit/Withdraw/FeesCrystallized/SettlementReported don't flip any FundVault-doc
    // state — TVL/price-per-share/lockedLiability are read live on-chain by the
    // frontend (same convention as PlacerVault's balance()/paused() reads) — these
    // just reach the socket subscribers below for real-time UI refresh.
  }
}

async function processLogsInChunks(provider, filterBase, fromBlock, toBlock, onChunk) {
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock)
    try {
      const logs = await provider.getLogs({ ...filterBase, fromBlock: start, toBlock: end })
      if (logs.length > 0) await onChunk(logs)
    } catch (err) {
      console.warn(`[${ts()}] [FundVaultListener] chunk ${start}-${end} failed: ${err.message}`)
    }
    if (end < toBlock) await sleep(CHUNK_DELAY_MS)
  }
}

async function syncHistoricalFundVaultEvents(provider, factoryAddress) {
  const toBlock = await provider.getBlockNumber()
  const fromBlock = await getLastSyncedBlock()

  if (fromBlock >= toBlock) {
    console.log(`[${ts()}] [FundVaultListener] Already up to date at block ${toBlock}`)
    return
  }

  console.log(`[${ts()}] [FundVaultListener] Historical sync: blocks ${fromBlock}-${toBlock}`)

  const factoryInterface = new ethers.Interface(FACTORY_ABI)
  let createdCount = 0
  await processLogsInChunks(
    provider,
    { address: factoryAddress, topics: [FUND_VAULT_CREATED_TOPIC] },
    fromBlock, toBlock,
    async (logs) => {
      for (const log of logs) {
        const parsed = factoryInterface.parseLog(log)
        await handleFundVaultCreated(parsed.args.owner, parsed.args.vault, log.transactionHash, log.blockNumber)
        createdCount++
      }
    }
  )

  await sleep(2_000)

  let logCount = 0
  await processLogsInChunks(
    provider,
    { topics: [FUND_VAULT_TOPICS] },
    fromBlock, toBlock,
    async (logs) => {
      for (const log of logs) {
        await handleFundVaultLog(log)
        logCount++
      }
    }
  )

  await saveLastSyncedBlock(toBlock)
  console.log(`[${ts()}] [FundVaultListener] Historical sync done: ${createdCount} fund vault(s) created, ${logCount} event(s) processed`)
}

/**
 * @param {ethers.Provider} provider
 * @param {string}          factoryAddress
 * @param {object}          io - Socket.IO server (may be null)
 * @param {boolean}         skipHistoricalSync - true on reconnect (DB already populated)
 */
async function startFundVaultListener(provider, factoryAddress, io, skipHistoricalSync = false) {
  await loadKnownFundVaults()
  if (skipHistoricalSync) {
    console.log(`[${ts()}] [FundVaultListener] Historical sync skipped — reconnect mode`)
  } else {
    await syncHistoricalFundVaultEvents(provider, factoryAddress)
  }

  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider)

  factory.on('FundVaultCreated', async (owner, vault, ev) => {
    try {
      await handleFundVaultCreated(owner, vault, ev.log.transactionHash, ev.log.blockNumber)
      io?.emit('fundVault:created', { owner, vault })
    } catch (err) {
      console.error(`[${ts()}] [FundVaultCreated] error: ${err.message}`)
    }
  })

  provider.on({ topics: [FUND_VAULT_TOPICS] }, async (log) => {
    try {
      await handleFundVaultLog(log)
      const addr = log.address.toLowerCase()
      if (knownFundVaults.has(addr)) io?.emit('fundVault:updated', { vault: addr })
    } catch (err) {
      console.error(`[${ts()}] [FundVaultListener] log error: ${err.message}`)
    }
  })

  console.log(`[${ts()}] [FundVaultListener] Real-time subscriptions active (factory=${factoryAddress})`)
}

module.exports = { startFundVaultListener, syncHistoricalFundVaultEvents, handleFundVaultCreated }
