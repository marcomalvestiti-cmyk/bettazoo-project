const mongoose = require('mongoose')

// Single real-time log poller for every on-chain source (Escrow, vault factories,
// vault clones). Replaces ethers' contract.on()/provider.on(filter) subscriptions:
// on an RPC without eth_newFilter (public Arbitrum, dRPC free) ethers falls back to
// a PollingEventSubscriber that fires one eth_getLogs PER BLOCK PER SUBSCRIPTION —
// ~56 blocks every 15s × 8 subscriptions ≈ 30 req/s, the real cause of the sustained
// 429s (and of the indexing lag seen on 2026-09-01). This does one eth_getLogs per
// source per tick over the whole new block range instead (~0.4 req/s), and persists
// progress so a restart or a failed tick resumes without gaps.

// Same 'syncstate' collection the listeners' historical syncs use — the poller
// advances their lastBlock as it goes, so the next boot's historical sync only
// covers the blocks since the last successful tick.
const SyncState = mongoose.models.SyncState ?? mongoose.model(
  'SyncState',
  new mongoose.Schema(
    { _id: String, lastBlock: { type: Number, default: 0 } },
    { collection: 'syncstate' }
  )
)

function ts() { return new Date().toISOString() }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @param {object}   opts
 * @param {object}   opts.provider     - ethers provider (getBlockNumber, getLogs)
 * @param {Array}    opts.sources      - [{ label, filter, onLogs(logs) }], queried in
 *                                       order per chunk (factories before their clones,
 *                                       so a vault created in a chunk is known before
 *                                       that chunk's vault-topic logs are handled)
 * @param {string[]} opts.syncStateIds - SyncState _ids to start from and advance
 * @param {number}   opts.intervalMs
 * @param {number}   opts.chunkSize    - max blocks per eth_getLogs (provider limit)
 * @param {number}   opts.chunkDelayMs - pause between chunks while catching up
 */
function createLogPoller({ provider, sources, syncStateIds, intervalMs = 15_000, chunkSize = 2000, chunkDelayMs = 300 }) {
  let lastBlock = null
  let timer = null
  let inFlight = false
  let stopped = false

  async function loadStartBlock() {
    const docs = await SyncState.find({ _id: { $in: syncStateIds } }).lean()
    if (docs.length > 0) return Math.min(...docs.map((d) => d.lastBlock))
    return provider.getBlockNumber()
  }

  async function saveProgress(block) {
    await SyncState.bulkWrite(syncStateIds.map((id) => ({
      updateOne: { filter: { _id: id }, update: { $max: { lastBlock: block } }, upsert: true },
    })))
  }

  async function tick() {
    if (inFlight || stopped) return
    inFlight = true
    try {
      if (lastBlock === null) lastBlock = await loadStartBlock()
      const head = await provider.getBlockNumber()
      for (let start = lastBlock + 1; start <= head && !stopped; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, head)
        for (const source of sources) {
          const logs = await provider.getLogs({ ...source.filter, fromBlock: start, toBlock: end })
          if (logs.length > 0) await source.onLogs(logs)
        }
        // Only advance once EVERY source succeeded for this chunk — a failure below
        // leaves lastBlock where it was, so the next tick retries the same range
        // (handlers are upserts, re-processing a partially handled chunk is safe).
        lastBlock = end
        await saveProgress(end)
        if (end < head) await sleep(chunkDelayMs)
      }
    } catch (err) {
      console.warn(`[${ts()}] [LogPoller] tick failed at block ${lastBlock} — retrying next tick: ${err.message}`)
    } finally {
      inFlight = false
    }
  }

  function start() {
    console.log(`[${ts()}] [LogPoller] Starting — ${sources.length} source(s), every ${intervalMs}ms, chunk ${chunkSize}`)
    tick()
    timer = setInterval(tick, intervalMs)
  }

  function stop() {
    stopped = true
    if (timer) clearInterval(timer)
    timer = null
  }

  return { start, stop, tick, getLastBlock: () => lastBlock }
}

module.exports = { createLogPoller }
