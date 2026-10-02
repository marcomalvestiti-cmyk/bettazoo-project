// Client-side half of the minimal admin gate — see backend/src/middleware/adminAuth.js
// for what's actually enforced (this alone proves nothing; it's storage + a header,
// not real auth). If the backend has no ADMIN_SECRET configured, any value works —
// the header gets sent either way, the backend just doesn't check it.

const STORAGE_KEY = 'bettazoo_admin_secret'

export function getAdminSecret(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setAdminSecret(secret: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, secret.trim())
  } catch { /* private browsing / storage blocked — the prompt will just reappear */ }
}

export function clearAdminSecret() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch { /* nothing to clear if storage never worked */ }
}

// Spread into fetch init.headers on every /api/admin/* and /api/oracle/resolve call.
export function adminHeaders(): Record<string, string> {
  const secret = getAdminSecret()
  return secret ? { 'x-admin-secret': secret } : {}
}
