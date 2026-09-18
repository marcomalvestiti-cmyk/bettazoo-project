// ── Global crash guards — MUST be registered before any other code ───────────
// Node 18+ exits on unhandledRejection by default; these handlers keep Railway alive.
// errorTracking is required lazily inside the handlers (not at top-level) purely so
// these two registrations stay first — by the time either actually fires, dotenv has
// long since loaded SENTRY_DSN.
process.on('uncaughtException', (err) => {
  console.error(`[${ts()}] [CRASH GUARD] Uncaught exception — process continues:`)
  console.error(err.stack || err.message)
  require('./services/errorTracking').captureException(err, { source: 'uncaughtException' })
})
process.on('unhandledRejection', (reason) => {
  console.error(`[${ts()}] [CRASH GUARD] Unhandled promise rejection — process continues:`)
  console.error(reason instanceof Error ? reason.stack : String(reason))
  const err = reason instanceof Error ? reason : new Error(String(reason))
  require('./services/errorTracking').captureException(err, { source: 'unhandledRejection' })
})

function ts() { return new Date().toISOString() }

require('dotenv').config()
const http = require('http')
const { Server } = require('socket.io')
const app = require('./app')
const connectDB = require('./config/db')
const { startListener } = require('./services/web3Listener')
const { startVaultListener } = require('./services/vaultListener')
const { startKeeper } = require('./services/keeperService')
const { startEventsSync } = require('./services/eventsFeedService')
const { initErrorTracking } = require('./services/errorTracking')

initErrorTracking()

const PORT = process.env.PORT || 3001

// Reconnect timer handle (shared state for debounce)
let web3ReconnectTimer = null
// Keep a reference to the active provider so we can destroy it before reconnecting,
// preventing listener leaks and orphaned WebSocket connections in memory.
let activeProvider = null
// The keeper's ethers.Wallet is bound to a specific provider — it must be restarted
// (not left running against a destroyed provider) whenever startWeb3 reconnects.
let activeKeeperInterval = null

// ── Memory monitor — logs heap usage every 60 s so Railway logs show trends ──
setInterval(() => {
  const { heapUsed, heapTotal, rss } = process.memoryUsage()
  console.log(
    `[${ts()}] [Memory] RSS: ${Math.round(rss / 1024 / 1024)}MB | ` +
    `Heap: ${Math.round(heapUsed / 1024 / 1024)}/${Math.round(heapTotal / 1024 / 1024)}MB`
  )
}, 60_000).unref() // unref so the interval doesn't prevent graceful shutdown

async function main() {
  // ── MongoDB ──────────────────────────────────────────────────────────────────
  let dbConnected = false
  try {
    await connectDB()
    dbConnected = true
  } catch (err) {
    console.warn(`[${ts()}] ⚠️  MongoDB unavailable: ${err.message}`)
    console.warn(`[${ts()}] ⚠️  Server starting in OFFLINE mode — DB routes return mock/empty data.`)
  }

  // ── Event catalog ────────────────────────────────────────────────────────────
  // DB-only, independent of the RPC/web3 chain below — seeds the curated catalog
  // (and, if ODDS_API_KEY is set, starts the live odds sync loop) regardless of
  // whether the on-chain listener is configured.
  startEventsSync()

  const server = http.createServer(app)
  const io = new Server(server, { cors: { origin: '*' } })
  app.set('io', io)

  io.on('connection', (socket) => {
    console.log(`[${ts()}] Socket connected: ${socket.id}`)
    socket.on('disconnect', () => console.log(`[${ts()}] Socket disconnected: ${socket.id}`))
  })

  // ── Web3 listener ────────────────────────────────────────────────────────────
  if (process.env.RPC_URL && process.env.CONTRACT_ADDRESS) {
    app.set('rpcUrl', process.env.RPC_URL)
    app.set('contractAddress', process.env.CONTRACT_ADDRESS)
    if (!dbConnected) {
      console.warn(`[${ts()}] [Web3] Skipping listener — MongoDB not connected (historical sync would fail)`)
    } else {
      startWeb3(process.env.RPC_URL, process.env.CONTRACT_ADDRESS, io, false)
    }
  } else {
    console.warn(`[${ts()}] [Web3] RPC_URL or CONTRACT_ADDRESS not set — listener disabled`)
  }

  server.listen(PORT, () =>
    console.log(`\n[${ts()}] 🚀 Bettazoo backend listening on http://localhost:${PORT}\n`)
  )
}

/**
 * Creates an ethers provider, wires up error/disconnect recovery, then starts
 * the Web3 event listener.
 *
 * @param {string}  url              - RPC endpoint (http/https or wss)
 * @param {string}  contractAddress
 * @param {object}  io               - Socket.IO server
 * @param {boolean} skipHistoricalSync - true on reconnect (DB already populated)
 */
function startWeb3(url, contractAddress, io, skipHistoricalSync) {
  const { ethers } = require('ethers')

  // Destroy the previous provider before creating a new one.
  // This removes all contract event listeners and closes the WebSocket,
  // preventing orphaned connections and listener leaks across reconnects.
  if (activeProvider) {
    try {
      activeProvider.removeAllListeners?.()
      activeProvider.destroy?.()
      console.log(`[${ts()}] [Web3] Previous provider destroyed`)
    } catch (err) {
      console.warn(`[${ts()}] [Web3] Could not destroy previous provider: ${err?.message}`)
    }
    activeProvider = null
  }

  let provider
  try {
    if (url.startsWith('wss://') || url.startsWith('ws://')) {
      provider = new ethers.WebSocketProvider(url)
      console.log(`[${ts()}] [Web3] Using WebSocketProvider`)

      // ethers v6 exposes the raw WebSocket on _websocket (private but accessible)
      const ws = provider._websocket
      if (ws) {
        ws.on('close', (code) => {
          console.warn(`[${ts()}] [Web3] WebSocket closed (code=${code}) — scheduling reconnect`)
          scheduleReconnect(url, contractAddress, io)
        })
        ws.on('error', (err) => {
          console.error(`[${ts()}] [Web3] WebSocket error: ${err?.message || err}`)
        })
      }
    } else {
      provider = new ethers.JsonRpcProvider(url)
      // Reduce background eth_blockNumber polling from the default 4s to 15s
      // to stay under public RPC rate limits (public Arbitrum nodes are strict).
      provider.pollingInterval = 15_000
      console.log(`[${ts()}] [Web3] Using JsonRpcProvider (HTTP polling every 15s)`)
    }
  } catch (err) {
    console.error(`[${ts()}] [Web3] Failed to create provider: ${err.message}`)
    scheduleReconnect(url, contractAddress, io)
    return
  }

  activeProvider = provider

  // Public provider error event (works for both WS and HTTP providers in ethers v6)
  provider.on('error', (err) => {
    console.error(`[${ts()}] [Web3] Provider error: ${err?.message || err}`)
    scheduleReconnect(url, contractAddress, io)
  })

  const vaultFactoryAddress = process.env.VAULT_FACTORY_ADDRESS

  // Chained (not parallel): running both historical syncs concurrently doubles
  // the RPC request rate right when it's most likely to trip rate limits.
  startListener(provider, contractAddress, io, skipHistoricalSync)
    .catch((err) => {
      console.error(`[${ts()}] [Web3] Listener startup failed: ${err.message}`)
      scheduleReconnect(url, contractAddress, io)
    })
    .then(() => {
      if (!vaultFactoryAddress) {
        console.warn(`[${ts()}] [VaultListener] VAULT_FACTORY_ADDRESS not set — vault listener and keeper disabled`)
        return
      }
      return startVaultListener(provider, vaultFactoryAddress, io, skipHistoricalSync).then(() => {
        if (activeKeeperInterval) {
          clearInterval(activeKeeperInterval)
          activeKeeperInterval = null
        }
        activeKeeperInterval = startKeeper(provider) ?? null
      })
    })
    .catch((err) => {
      console.error(`[${ts()}] [VaultListener] Startup failed: ${err.message}`)
    })
}

function scheduleReconnect(url, contractAddress, io) {
  if (web3ReconnectTimer) return // already scheduled — don't double-up
  const delayMs = 30_000
  console.warn(`[${ts()}] [Web3] Reconnect scheduled in ${delayMs / 1000}s`)
  web3ReconnectTimer = setTimeout(() => {
    web3ReconnectTimer = null
    console.log(`[${ts()}] [Web3] Attempting reconnect…`)
    // Skip historical sync on reconnect — DB is already populated from the first run
    startWeb3(url, contractAddress, io, true)
  }, delayMs)
}

main().catch((err) => {
  console.error(`[${ts()}] Unrecoverable startup error:`, err)
  process.exit(1)
})
