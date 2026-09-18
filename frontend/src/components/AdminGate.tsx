'use client'

import { useState, useEffect } from 'react'
import { getAdminSecret, setAdminSecret, clearAdminSecret } from '@/lib/adminAuth'

// Wraps every /admin/* page. Doesn't validate anything itself — it just makes sure
// the raw page link alone isn't enough to reach the content: a passphrase has to be
// entered and stored once before any admin API call happens. The backend
// (middleware/adminAuth.js) is what actually accepts or rejects it.
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [secret, setSecretState] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setSecretState(getAdminSecret())
    setReady(true)
  }, [])

  function handleReset() {
    clearAdminSecret()
    setSecretState(null)
    setInput('')
  }

  if (!ready) return null

  if (!secret) {
    return (
      <div className="max-w-sm mx-auto px-4 py-20 space-y-4">
        <h1 className="text-lg font-bold text-white">Admin Access</h1>
        <p className="text-sm text-slate-400">
          Enter the admin passphrase to continue. If none has been set up yet, any value works for now.
        </p>
        <input
          id="admin-passphrase"
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && input) { setAdminSecret(input); setSecretState(input) } }}
          className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#FFB01F]"
          placeholder="Admin passphrase"
        />
        <button
          disabled={!input}
          onClick={() => { setAdminSecret(input); setSecretState(input) }}
          className="w-full py-2.5 text-sm font-bold rounded-md bg-[#FFB01F] hover:bg-amber-400 text-slate-950 disabled:opacity-50 transition-colors"
        >
          Continue
        </button>
      </div>
    )
  }

  return (
    <div>
      {children}
      <div className="max-w-4xl mx-auto px-4 pb-6">
        <button onClick={handleReset} className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors">
          Wrong passphrase? Reset it →
        </button>
      </div>
    </div>
  )
}
