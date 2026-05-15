export type BetRecord = {
  id: string
  offerId: number
  eventId: string
  eventName: string
  outcome: number
  oddsDecimal: number
  stakeUsdt: number
  potentialWinUsdt: number
  placedAt: string // ISO timestamp
}

const storageKey = (address: string) =>
  `bettazoo_bets_${address.toLowerCase()}`

export function saveBet(address: string, bet: BetRecord): void {
  if (typeof window === 'undefined') return
  const existing = loadBets(address)
  const updated = [bet, ...existing.filter((b) => b.id !== bet.id)]
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(updated.slice(0, 200)))
  } catch { /* storage quota exceeded */ }
}

export function loadBets(address: string): BetRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(address))
    return raw ? (JSON.parse(raw) as BetRecord[]) : []
  } catch {
    return []
  }
}
