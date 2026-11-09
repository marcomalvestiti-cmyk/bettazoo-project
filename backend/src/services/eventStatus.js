// An event is open for betting until kickoff and until the oracle has settled it.
//
// The Escrow contract has no notion of start time (eventIds are opaque strings), so
// this cutoff lives off-chain and is enforced in three places: GET /api/events?open=1
// only lists open events, the frontend event page disables the bet slip, and the
// keeper pulls its quotes shortly before kickoff (services/keeperService.js). A
// determined user can still call the contract directly against a stale offer, which
// is why the keeper cancels at kickoff — no vault liquidity is left to take.

// Quotes are pulled this long before kickoff, so a tick that lands just before the
// whistle can't leave an offer sitting on the book once the match is under way.
const KEEPER_CUTOFF_MS = Number(process.env.KEEPER_KICKOFF_CUTOFF_MS) || 5 * 60_000

function startMs(doc) {
  const t = doc?.startTime ? new Date(doc.startTime).getTime() : NaN
  return Number.isFinite(t) ? t : NaN
}

function isEventOpen(doc, now = Date.now()) {
  if (!doc || doc.resolved) return false
  const start = startMs(doc)
  return Number.isFinite(start) && start > now
}

// Stricter than isEventOpen: also closed within KEEPER_CUTOFF_MS of kickoff.
function isEventQuotable(doc, now = Date.now()) {
  return isEventOpen(doc, now + KEEPER_CUTOFF_MS)
}

module.exports = { isEventOpen, isEventQuotable, KEEPER_CUTOFF_MS }
