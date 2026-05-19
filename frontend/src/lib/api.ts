const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const FETCH_TIMEOUT_MS = 10_000

// ── Generic fetch wrapper with timeout and detailed error logging ──────────────
async function apiFetch(label: string, input: RequestInfo, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(input, { ...init, signal: controller.signal })
    clearTimeout(timer)
  } catch (networkErr) {
    clearTimeout(timer)
    if (networkErr instanceof Error && networkErr.name === 'AbortError') {
      console.error(`[${label}] Request timed out after ${FETCH_TIMEOUT_MS}ms`)
      throw new Error(`${label}: request timed out after ${FETCH_TIMEOUT_MS / 1000}s`)
    }
    console.error(
      `[${label}] Network error — is the backend running on ${BASE}?`,
      networkErr
    )
    throw new Error(`${label}: backend not reachable (is it running on ${BASE}?)`)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[${label}] HTTP ${res.status} ${res.statusText}:`, body || '(empty body)')
    let parsed: { error?: string } = {}
    try { parsed = JSON.parse(body) } catch { /* not JSON */ }
    throw new Error(parsed.error ?? `${label} failed with HTTP ${res.status}`)
  }
  return res
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function fetchOrderBook(eventId: string, outcome?: number) {
  const params = new URLSearchParams()
  if (outcome !== undefined) params.set('outcome', String(outcome))
  params.set('_t', String(Date.now()))
  const res = await apiFetch(
    'orderbook',
    `${BASE}/api/orderbook/${eventId}?${params}`,
    { cache: 'no-store' },
  )
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
  margin?: number
}) {
  const res = await apiFetch('AI suggest-odds', `${BASE}/api/ai/suggest-odds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function fetchRiskManager(address: string) {
  const res = await apiFetch('risk-manager', `${BASE}/api/ai/risk-manager/${address}`)
  return res.json()
}

export type OracleEvent = {
  eventId:        string
  resolved:       boolean
  winningOutcome?: number
  resolvedAt?:    string
}

export async function fetchOracleEvents(): Promise<OracleEvent[]> {
  try {
    const res  = await apiFetch('oracle events', `${BASE}/api/oracle/events`)
    const data = await res.json()
    return (data.events ?? []) as OracleEvent[]
  } catch {
    return []
  }
}

export async function postOracleResolve(body: { eventId: string; winningOutcome: number }) {
  const res = await apiFetch('oracle resolve', `${BASE}/api/oracle/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export type Specialization = {
  category: string
  sport:    string
  league:   string
}

export type ProfileData = {
  address:        string
  nickname:       string
  bio:            string
  specialization: Specialization
}

const EMPTY_SPEC: Specialization = { category: '', sport: '', league: '' }

export async function fetchProfile(address: string): Promise<ProfileData> {
  const res = await apiFetch('profile GET', `${BASE}/api/profile/${address}`)
  const data = await res.json()
  return {
    address:        data.address,
    nickname:       data.nickname ?? '',
    bio:            data.bio ?? '',
    specialization: data.specialization ?? EMPTY_SPEC,
  }
}

export async function updateProfile(
  address: string,
  nickname: string,
  bio: string,
  specialization?: Specialization,
): Promise<ProfileData> {
  const res = await apiFetch('profile PUT', `${BASE}/api/profile/${address}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, bio, specialization }),
  })
  const data = await res.json()
  return {
    address:        data.address,
    nickname:       data.nickname ?? '',
    bio:            data.bio ?? '',
    specialization: data.specialization ?? EMPTY_SPEC,
  }
}

export const SOCKET_URL = BASE
