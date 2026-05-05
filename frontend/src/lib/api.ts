const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function fetchOrderBook(eventId: string, outcome?: number) {
  const qs = outcome !== undefined ? `?outcome=${outcome}` : ''
  const res = await fetch(`${BASE}/api/orderbook/${eventId}${qs}`)
  if (!res.ok) throw new Error('orderbook fetch failed')
  return res.json()
}

export async function fetchSuggestOdds(body: {
  eventId: string
  eventName?: string
  sport?: string
  teams?: string[]
  outcome?: number
  currentMarketOdds?: number[]
  placerExposureUsdt?: number
}) {
  const res = await fetch(`${BASE}/api/ai/suggest-odds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('suggest-odds failed')
  return res.json()
}

export async function fetchRiskManager(address: string) {
  const res = await fetch(`${BASE}/api/ai/risk-manager/${address}`)
  if (!res.ok) throw new Error('risk-manager fetch failed')
  return res.json()
}

export async function postOracleResolve(body: {
  eventId: string
  winningOutcome: number
}) {
  const res = await fetch(`${BASE}/api/oracle/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('oracle resolve failed')
  return res.json()
}

export const SOCKET_URL = BASE
