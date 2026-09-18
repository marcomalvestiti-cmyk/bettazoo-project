const Event = require('../models/Event')
const { CURATED_EVENTS } = require('../data/curatedEvents')

function ts() { return new Date().toISOString() }

// Soccer leagues pulled from the live feed (The Odds API), kept to 3 to stay well
// inside the free tier's 500 requests/month: 3 leagues x 2 syncs/day (12h interval,
// see EVENTS_SYNC_INTERVAL_MS) x 30 days ~= 180 requests/month, leaving margin for
// manual restarts. Basketball/tennis/esports stay on the curated catalog below —
// most odds-feed providers don't cover esports at all, and football is the only
// market that's naturally 3-way (home/draw/away), matching the outcome model the
// Escrow contract already uses (OUTCOMES 0/1/2 in frontend/src/lib/abis.ts).
const LIVE_SOCCER_LEAGUES = [
  { sportKey: 'soccer_italy_serie_a',      league: 'serie-a',           leagueLabel: 'Serie A' },
  { sportKey: 'soccer_epl',                league: 'premier-league',    leagueLabel: 'Premier League' },
  { sportKey: 'soccer_uefa_champs_league', league: 'champions-league',  leagueLabel: 'Champions League' },
]

// Upserts the curated catalog into Mongo. Only ever touches catalog fields (name,
// teams, startTime, labels…) — resolved/winningOutcome/resolvedAt are set once via
// $setOnInsert and never overwritten here, so re-seeding on every boot can never
// un-resolve an event the oracle already settled.
async function seedCuratedEvents() {
  for (const ev of CURATED_EVENTS) {
    await Event.findOneAndUpdate(
      { eventId: ev.eventId },
      {
        $set: {
          name: ev.name, sport: ev.sport, teams: ev.teams, startTime: ev.startTime,
          category: ev.category, league: ev.league, sportLabel: ev.sportLabel,
          leagueLabel: ev.leagueLabel, icon: ev.icon, source: 'curated',
        },
        $setOnInsert: { resolved: false },
      },
      { upsert: true }
    )
  }
  console.log(`[${ts()}] [EventsFeed] Seeded ${CURATED_EVENTS.length} curated events`)
}

function averageOdds(bookmakers, outcomeName) {
  const prices = (bookmakers ?? [])
    .flatMap((b) => b.markets?.find((m) => m.key === 'h2h')?.outcomes ?? [])
    .filter((o) => o.name === outcomeName)
    .map((o) => o.price)
  if (!prices.length) return null
  return prices.reduce((a, b) => a + b, 0) / prices.length
}

// Fetches h2h (1X2) odds from The Odds API for each configured league and upserts
// them as 'live' events. No-ops silently if ODDS_API_KEY isn't set — the curated
// catalog above is a complete, working fallback on its own.
async function syncLiveSoccer() {
  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) return

  for (const { sportKey, league, leagueLabel } of LIVE_SOCCER_LEAGUES) {
    try {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h&oddsFormat=decimal`
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.warn(`[${ts()}] [EventsFeed] ${sportKey}: HTTP ${res.status} — ${body.slice(0, 200)}`)
        continue
      }
      const fixtures = await res.json()
      for (const fx of fixtures) {
        const eventId = `live-${fx.id}`
        // Reference market odds — not used to price anything yet (that's the Tier 2
        // Quant Engine), stored now because it's free to capture while parsing this
        // response and saves re-fetching it later.
        const referenceOdds = [
          averageOdds(fx.bookmakers, fx.home_team),
          averageOdds(fx.bookmakers, 'Draw'),
          averageOdds(fx.bookmakers, fx.away_team),
        ]
        await Event.findOneAndUpdate(
          { eventId },
          {
            $set: {
              name: `${fx.home_team} vs ${fx.away_team}`,
              sport: 'football', teams: [fx.home_team, fx.away_team],
              startTime: fx.commence_time,
              category: 'sports', league, sportLabel: 'Football', leagueLabel,
              icon: '⚽', source: 'live', referenceOdds,
            },
            $setOnInsert: { resolved: false },
          },
          { upsert: true }
        )
      }
      console.log(`[${ts()}] [EventsFeed] ${sportKey}: synced ${fixtures.length} fixture(s)`)
    } catch (err) {
      console.error(`[${ts()}] [EventsFeed] ${sportKey} sync failed: ${err.message}`)
    }
  }
}

// Seeds the curated catalog once at boot (always — it's the offline-safe baseline),
// then starts the live odds sync loop if ODDS_API_KEY is configured. Returns the
// interval handle (or null if live sync is disabled) so callers could clearInterval
// it on shutdown if ever needed; unref'd so it never blocks graceful exit.
function startEventsSync() {
  seedCuratedEvents().catch((err) =>
    console.error(`[${ts()}] [EventsFeed] Curated seed failed: ${err.message}`)
  )

  if (!process.env.ODDS_API_KEY) {
    console.warn(`[${ts()}] [EventsFeed] ODDS_API_KEY not set — live odds sync disabled, serving curated catalog only`)
    return null
  }

  syncLiveSoccer().catch((err) =>
    console.error(`[${ts()}] [EventsFeed] Initial live sync failed: ${err.message}`)
  )
  const intervalMs = Number(process.env.EVENTS_SYNC_INTERVAL_MS) || 12 * 60 * 60 * 1000
  const handle = setInterval(() => {
    syncLiveSoccer().catch((err) =>
      console.error(`[${ts()}] [EventsFeed] Live sync failed: ${err.message}`)
    )
  }, intervalMs)
  handle.unref?.()
  return handle
}

module.exports = { startEventsSync, seedCuratedEvents, syncLiveSoccer }
