const { ethers } = require('ethers')
const GasDrip = require('../models/GasDrip')

// Testnet gas faucet: sends a small amount of Arbitrum Sepolia ETH to a new user's
// wallet so they can pay for their first transactions (BTZ-USD faucet claim, approve,
// bet). Public faucets usually require a mainnet balance or an account, which is the
// main thing that stalls a classroom onboarding.
//
// Abuse limits (testnet ETH only, so the goal is "don't get drained", not perfect
// Sybil resistance):
//  - once per address, ever (unique index on GasDrip.address)
//  - skipped if the address already holds at least one drip's worth of ETH
//  - a global daily cap (GAS_FAUCET_DAILY_LIMIT)
//  - a per-IP daily cap (GAS_FAUCET_PER_IP_DAILY), generous by default because a
//    whole classroom on university Wi-Fi shares one public IP
//  - the faucet wallet always keeps GAS_FAUCET_RESERVE_ETH for itself
//
// Transfers go out one at a time through a promise queue, so concurrent claims never
// race on the faucet wallet's nonce.

function ts() { return new Date().toISOString() }
const DAY_MS = 24 * 60 * 60 * 1000

function readConfig(env = process.env) {
  return {
    privateKey: env.GAS_FAUCET_PRIVATE_KEY,
    rpcUrl:     env.RPC_URL,
    amountWei:  ethers.parseEther(env.GAS_FAUCET_AMOUNT_ETH || '0.0005'),
    reserveWei: ethers.parseEther(env.GAS_FAUCET_RESERVE_ETH || '0.002'),
    dailyLimit: Number(env.GAS_FAUCET_DAILY_LIMIT) || 100,
    perIpDaily: Number(env.GAS_FAUCET_PER_IP_DAILY) || 60,
  }
}

function makeProvider(url) {
  return url.startsWith('ws://') || url.startsWith('wss://')
    ? new ethers.WebSocketProvider(url)
    : new ethers.JsonRpcProvider(url)
}

/**
 * @param {object}   deps
 * @param {object}   deps.config         see readConfig
 * @param {function} deps.getBalance     async (address) => bigint (wei)
 * @param {function} deps.sendEth        async (to, amountWei) => txHash
 * @param {string}   [deps.faucetAddress] faucet wallet, to check its own balance
 */
function createGasFaucet({ config, getBalance, sendEth, faucetAddress }) {
  let queue = Promise.resolve()

  async function status(address, ip) {
    if (typeof address !== 'string' || !ethers.isAddress(address)) {
      return { eligible: false, reason: 'invalid_address' }
    }
    const addr = address.toLowerCase()
    const base = { amountEth: ethers.formatEther(config.amountWei) }

    const existing = await GasDrip.findOne({ address: addr }).lean()
    if (existing) return { ...base, eligible: false, reason: 'already_claimed', txHash: existing.txHash }

    const balance = await getBalance(addr)
    if (balance >= config.amountWei) return { ...base, eligible: false, reason: 'has_balance' }

    const since = new Date(Date.now() - DAY_MS)
    const today = await GasDrip.countDocuments({ createdAt: { $gte: since } })
    if (today >= config.dailyLimit) return { ...base, eligible: false, reason: 'daily_limit' }
    if (ip) {
      const fromIp = await GasDrip.countDocuments({ ip, createdAt: { $gte: since } })
      if (fromIp >= config.perIpDaily) return { ...base, eligible: false, reason: 'ip_limit' }
    }

    if (faucetAddress) {
      const own = await getBalance(faucetAddress)
      if (own < config.amountWei + config.reserveWei) return { ...base, eligible: false, reason: 'faucet_empty' }
    }
    return { ...base, eligible: true }
  }

  async function claimNow(address, ip) {
    const s = await status(address, ip)
    if (!s.eligible) return s
    const addr = address.toLowerCase()

    // Reserve the slot first; a duplicate key here means a concurrent claim won.
    try {
      await GasDrip.create({ address: addr, amountWei: config.amountWei.toString(), ip })
    } catch (err) {
      if (err?.code === 11000) return { ...s, eligible: false, reason: 'already_claimed' }
      throw err
    }

    try {
      const txHash = await sendEth(addr, config.amountWei)
      await GasDrip.updateOne({ address: addr }, { $set: { txHash, status: 'sent' } })
      console.log(`[${ts()}] [GasFaucet] sent ${s.amountEth} ETH to ${addr} tx=${txHash}`)
      return { ...s, eligible: false, claimed: true, txHash }
    } catch (err) {
      // Transfer failed: release the slot so the user can retry.
      await GasDrip.deleteOne({ address: addr })
      console.error(`[${ts()}] [GasFaucet] send to ${addr} failed: ${err.message}`)
      return { ...s, eligible: false, reason: 'send_failed' }
    }
  }

  function claim(address, ip) {
    const result = queue.then(() => claimNow(address, ip))
    queue = result.catch(() => {})
    return result
  }

  return { status, claim }
}

let singleton = null

// Lazily builds the real faucet from env; null when not configured.
function getGasFaucet() {
  if (singleton) return singleton
  const config = readConfig()
  if (!config.privateKey || !config.rpcUrl) return null

  const provider = makeProvider(config.rpcUrl)
  const wallet = new ethers.Wallet(config.privateKey, provider)
  singleton = createGasFaucet({
    config,
    faucetAddress: wallet.address.toLowerCase(),
    getBalance: (addr) => provider.getBalance(addr),
    sendEth: async (to, amountWei) => {
      const tx = await wallet.sendTransaction({ to, value: amountWei })
      await tx.wait()
      return tx.hash
    },
  })
  console.log(`[${ts()}] [GasFaucet] enabled, wallet=${wallet.address} amount=${ethers.formatEther(config.amountWei)} ETH`)
  return singleton
}

module.exports = { createGasFaucet, getGasFaucet, readConfig }
