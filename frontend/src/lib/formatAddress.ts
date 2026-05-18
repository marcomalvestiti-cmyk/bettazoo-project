// Known maker registry — keys must be lowercase for case-insensitive lookup.
// Replace placeholder addresses with real wallet addresses.
export const KNOWN_MAKERS: Record<string, string> = {
  '0xa4c486ceaff47a130057bd624dcd265fa66f3284': 'Bettazoo Official',
  // '0xPLACEHOLDER_PARTNER_WALLET': 'Pro Placer',
}

export function isKnownMaker(address: string | undefined | null): boolean {
  if (!address) return false
  return Object.prototype.hasOwnProperty.call(KNOWN_MAKERS, address.toLowerCase())
}

export function displayMakerName(address: string | undefined | null): string {
  if (!address) return '—'
  const nickname = KNOWN_MAKERS[address.toLowerCase()]
  if (nickname) return nickname
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
