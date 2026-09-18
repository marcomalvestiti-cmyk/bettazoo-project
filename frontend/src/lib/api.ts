import type { MockEvent } from '@/lib/abis'

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

// GET /api/events — the real event catalog (live football feed + curated fallback,
// see backend/src/services/eventsFeedService.js). Callers should fall back to
// MOCK_EVENTS on error/empty — see lib/useEvents.ts for the client-side hook that
// does this automatically; server components call this directly (e.g. app/page.tsx).
export async function fetchEvents(): Promise<MockEvent[]> {
  const res = await apiFetch('events', `${BASE}/api/events`, { cache: 'no-store' })
  const data = await res.json()
  return data.events ?? []
}

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

export async function postReferral(body: {
  placer: string
  bettor: string
  offerId: number
  eventId: string
}): Promise<void> {
  try {
    await apiFetch('referral POST', `${BASE}/api/social/referral`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // non-critical, silent fail
  }
}

export async function fetchChallengers(address: string): Promise<{ uniqueChallengers: number; challengers: string[] }> {
  try {
    const res = await apiFetch('challengers', `${BASE}/api/social/challengers/${address}`)
    return res.json()
  } catch {
    return { uniqueChallengers: 0, challengers: [] }
  }
}

export type VaultScope = { eventId: string; outcomes: number[] }

export type VaultData = {
  exists:                 boolean
  ownerAddress?:          string
  vaultAddress?:          string
  keeperAddress?:         string
  onChainPaused?:         boolean
  status?:                'configuring' | 'active' | 'stopped'
  strategy?:              { marginStrategyId: 'volume' | 'balanced' | 'safe' | 'custom'; customMargin?: number }
  scope?:                 VaultScope[]
  maxExposureUsdt?:       number
  perMarketExposureUsdt?: number
  stopLossUsdt?:          number
  minOdds?:               number
  maxOdds?:               number
  liabilityIncrementUsdt?: number
  agreementVersion?:       number | null
  agreementSignedAt?:      string | null
  agreementCurrentVersion?: number
  kycStatus?:              'none' | 'pending' | 'approved' | 'rejected'
  createdAtTx?:           string
  createdAtBlock?:        number
}

export async function fetchVault(ownerAddress: string): Promise<VaultData> {
  const res = await apiFetch('vault GET', `${BASE}/api/vaults/${ownerAddress}`, { cache: 'no-store' })
  return res.json()
}

// Must match backend/src/routes/vaults.js's buildSignMessage() exactly — the backend
// recovers the signer from this same string, so any drift breaks every config save.
// The backend always rebuilds it from req.params.ownerAddress.toLowerCase(), so the
// address must be lowercased here too — wagmi's useAccount().address is checksummed
// (mixed-case), which would otherwise sign a different message than the backend verifies.
export function buildVaultConfigMessage(ownerAddress: string, timestamp: number): string {
  return `Bettazoo vault config update\nowner:${ownerAddress.toLowerCase()}\ntimestamp:${timestamp}`
}

export type VaultConfigPatch = {
  marginStrategyId?:       'volume' | 'balanced' | 'safe' | 'custom'
  customMargin?:           number
  scope?:                  VaultScope[]
  maxExposureUsdt?:        number
  perMarketExposureUsdt?:  number
  stopLossUsdt?:           number
  minOdds?:                number
  maxOdds?:                number
  liabilityIncrementUsdt?: number
  status?:                 'configuring' | 'active'
  kycRequestReview?:       true
}

export async function patchVaultConfig(
  ownerAddress: string,
  signature: string,
  timestamp: number,
  config: VaultConfigPatch,
): Promise<VaultData> {
  const res = await apiFetch('vault PATCH', `${BASE}/api/vaults/${ownerAddress}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, timestamp, config }),
  })
  return res.json()
}

export async function postVaultAgreement(
  ownerAddress: string,
  signature: string,
  timestamp: number,
): Promise<VaultData> {
  const res = await apiFetch('vault agreement', `${BASE}/api/vaults/${ownerAddress}/agreement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, timestamp }),
  })
  return res.json()
}

export type VaultOffer = {
  offerId:                number
  eventId:                string
  outcome:                number
  odds:                   number
  oddsDecimal:            number
  remainingLiabilityUsdt: string
  maxBettorStakeUsdt:     string
  active:                 boolean
  txHash?:                string
}

export async function fetchVaultOffers(ownerAddress: string, activeOnly = false): Promise<{ vaultAddress?: string; orders: VaultOffer[] }> {
  const params = activeOnly ? '?active=true' : ''
  const res = await apiFetch('vault offers', `${BASE}/api/vaults/${ownerAddress}/offers${params}`, { cache: 'no-store' })
  return res.json()
}

export async function fetchVaultPnl(ownerAddress: string): Promise<{
  realizedPnlUsdt: number
  matchesSettled: number
  stopLossUsdt?: number
  stopLossTriggered?: boolean
}> {
  const res = await apiFetch('vault pnl', `${BASE}/api/vaults/${ownerAddress}/pnl`, { cache: 'no-store' })
  return res.json()
}

export type AdminKycRow = {
  ownerAddress:      string
  vaultAddress:      string
  status:            'configuring' | 'active' | 'stopped'
  kycStatus:         'none' | 'pending' | 'approved' | 'rejected'
  agreementVersion:  number | null
  agreementSignedAt: string | null
  createdAt:         string
}

export async function fetchAdminKyc(): Promise<AdminKycRow[]> {
  const res = await apiFetch('admin kyc', `${BASE}/api/admin/kyc`, { cache: 'no-store' })
  const data = await res.json()
  return data.vaults ?? []
}

export async function postAdminKycDecision(
  ownerAddress: string,
  status: 'approved' | 'rejected' | 'none',
): Promise<{ ownerAddress: string; kycStatus: string }> {
  const res = await apiFetch('admin kyc decision', `${BASE}/api/admin/kyc/${ownerAddress}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return res.json()
}

export const SOCKET_URL = BASE
