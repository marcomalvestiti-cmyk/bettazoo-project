const { ethers } = require('ethers')
const Event = require('../models/Event')
const { LIVE_SOCCER_LEAGUES } = require('./eventsFeedService')

// Automatic settlement of real (live-feed) fixtures from The Odds API scores endpoint.
//
// Only events with source='live' are ever touched: their eventId is `live-<odds api id>`
// (see syncLiveSoccer in eventsFeedService.js), so the result can be matched back
// exactly. Curated events stay manual (admin resolver page), because their fixtures
// are not real and have no result to look up.
//
// Credit budget (free tier = 500 requests/month): the scores endpoint with daysFrom
// costs 2 credits per league. It is only called for leagues that have at least one
// unresolved fixture that kicked off more than RESULT_GRACE_MS ago, so on days with
// no matches it costs nothing, and most fixtures are settled by the first check after
// full time. Calls are skipped when the remaining quota (x-requests-remaining header)
// drops below MIN_REMAINING_CREDITS, keeping some budget for the odds sync.
//
// Outcome mapping matches the Escrow / frontend OUTCOMES: 0 = home, 1 = draw, 2 = away.
// The h2h market the odds feed prices is the regular-time result; league-phase
// fixtures have no extra time, so the final score is the regular-time score.

const ESCROW_ABI = [
  'function resolveEvent(string calldata eventId, uint8 winningOutcome) external',
  'function eventResolved(string) view returns (bool)',
]

const RESULT_GRACE_MS = Number(process.env.RESULT_GRACE_MS) || 2.5 * 60 * 60 * 1000
const MIN_REMAINING_CREDITS = 25
const SCORES_DAYS_FROM = 3

function ts() { return new Date().toISOString() }

// Pure: turns one fixture from the scores endpoint into an outcome index, or null if
// it isn't final yet / the scores can't be read unambiguously.
function outcomeFromScores(fixture) {
  if (!fixture?.completed || !Array.isArray(fixture.scores)) return null
  const byName = new Map(fixture.scores.map((s) => [s.name, Number(s.score)]))
  const home = byName.get(fixture.home_team)
  const away = byName.get(fixture.away_team)
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null
  if (home > away) return 0
  if (home === away) return 1
  return 2
}

function makeProvider(url) {
  return url.startsWith('ws://') || url.startsWith('wss://')
    ? new ethers.WebSocketProvider(url)
    : new ethers.JsonRpcProvider(url)
}

// Default on-chain resolver: skips events the contract already settled (e.g. via the
// admin page) so a lagging DB never makes the keeper send a reverting tx.
function makeOnChainResolver({ rpcUrl, contractAddress, privateKey }) {
  return async function resolveOnChain(eventId, winningOutcome) {
    const provider = makeProvider(rpcUrl)
    try {
      const wallet = new ethers.Wallet(privateKey, provider)
      const escrow = new ethers.Contract(contractAddress, ESCROW_ABI, wallet)
      if (await escrow.eventResolved(eventId)) return { alreadyResolved: true }
      const tx = await escrow.resolveEvent(eventId, winningOutcome)
      const receipt = await tx.wait()
      return { txHash: receipt.hash }
    } finally {
      provider.destroy?.()
    }
  }
}

/**
 * One settlement pass. Dependencies are injectable for tests.
 * @returns {Promise<{resolved: string[], checkedLeagues: string[]}>}
 */
async function syncResults({
  apiKey = process.env.ODDS_API_KEY,
  resolveOnChain,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  const summary = { resolved: [], checkedLeagues: [] }
  if (!apiKey || !resolveOnChain) return summary

  const pending = await Event.find({
    source: 'live',
    resolved: { $ne: true },
    startTime: { $lte: new Date(now - RESULT_GRACE_MS) },
  }).lean()
  if (pending.length === 0) return summary

  const pendingById = new Map(pending.map((e) => [e.eventId, e]))
  const leagues = LIVE_SOCCER_LEAGUES.filter((l) => pending.some((e) => e.league === l.league))

  for (const { sportKey } of leagues) {
    let fixtures
    try {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${apiKey}&daysFrom=${SCORES_DAYS_FROM}`
      const res = await fetchImpl(url)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.warn(`[${ts()}] [Results] ${sportKey}: HTTP ${res.status} — ${body.slice(0, 200)}`)
        continue
      }
      fixtures = await res.json()
      summary.checkedLeagues.push(sportKey)
      const remaining = Number(res.headers?.get?.('x-requests-remaining'))
      if (Number.isFinite(remaining)) {
        console.log(`[${ts()}] [Results] ${sportKey}: ${fixtures.length} fixture(s), ${remaining} API credits left`)
        if (remaining < MIN_REMAINING_CREDITS) {
          console.warn(`[${ts()}] [Results] API credits low (${remaining}) — stopping this pass`)
          break
        }
      }
    } catch (err) {
      console.error(`[${ts()}] [Results] ${sportKey} fetch failed: ${err.message}`)
      continue
    }

    for (const fx of fixtures) {
      const eventId = `live-${fx.id}`
      if (!pendingById.has(eventId)) continue
      const outcome = outcomeFromScores(fx)
      if (outcome === null) continue

      try {
        const result = await resolveOnChain(eventId, outcome)
        await Event.updateOne(
          { eventId },
          { $set: { resolved: true, winningOutcome: outcome, resolvedAt: new Date() } }
        )
        summary.resolved.push(eventId)
        const detail = result?.alreadyResolved ? 'already resolved on-chain' : `tx=${result?.txHash}`
        const score = (fx.scores || []).map((s) => `${s.name} ${s.score}`).join(' - ')
        console.log(`[${ts()}] [Results] resolved ${eventId} (${score}) → outcome ${outcome} ${detail}`)
      } catch (err) {
        console.error(`[${ts()}] [Results] resolve ${eventId} failed: ${err.message}`)
      }
    }
  }

  // Anything still pending past the scores window can no longer be looked up
  // (postponed/abandoned, or the API dropped it) — flag it for the admin page.
  const tooOld = pending.filter((e) =>
    !summary.resolved.includes(e.eventId) &&
    new Date(e.startTime).getTime() < now - SCORES_DAYS_FROM * 24 * 60 * 60 * 1000
  )
  for (const e of tooOld) {
    console.warn(`[${ts()}] [Results] ${e.eventId} (${e.name}) still unresolved after ${SCORES_DAYS_FROM} days — resolve manually`)
  }

  return summary
}

// Starts the periodic settlement loop. Needs the odds API key plus the oracle signer
// (ORACLE_PRIVATE_KEY must be the Escrow's oracle or owner). Disabled with
// AUTO_RESOLVE_EVENTS=false.
function startResultsSync() {
  const { ODDS_API_KEY, RPC_URL, CONTRACT_ADDRESS, ORACLE_PRIVATE_KEY } = process.env
  if (process.env.AUTO_RESOLVE_EVENTS === 'false') {
    console.warn(`[${ts()}] [Results] AUTO_RESOLVE_EVENTS=false — automatic settlement disabled`)
    return null
  }
  if (!ODDS_API_KEY || !RPC_URL || !CONTRACT_ADDRESS || !ORACLE_PRIVATE_KEY) {
    console.warn(`[${ts()}] [Results] ODDS_API_KEY / RPC_URL / CONTRACT_ADDRESS / ORACLE_PRIVATE_KEY not all set — automatic settlement disabled`)
    return null
  }

  const resolveOnChain = makeOnChainResolver({
    rpcUrl: RPC_URL, contractAddress: CONTRACT_ADDRESS, privateKey: ORACLE_PRIVATE_KEY,
  })
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await syncResults({ resolveOnChain })
    } catch (err) {
      console.error(`[${ts()}] [Results] pass failed: ${err.message}`)
    } finally {
      running = false
    }
  }

  const intervalMs = Number(process.env.RESULTS_SYNC_INTERVAL_MS) || 3 * 60 * 60 * 1000
  console.log(`[${ts()}] [Results] Automatic settlement on — every ${Math.round(intervalMs / 60000)} min`)
  const first = setTimeout(run, 60_000)
  first.unref?.()
  const handle = setInterval(run, intervalMs)
  handle.unref?.()
  return handle
}

module.exports = { startResultsSync, syncResults, outcomeFromScores }
