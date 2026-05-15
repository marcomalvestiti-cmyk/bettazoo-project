'use client'

import { useEffect, useState } from 'react'

type Status = 'checking' | 'online' | 'offline'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const ONLINE_POLL_MS  = 60_000  // 1 min when healthy
const OFFLINE_POLL_MS = 15_000  // 15 s when down — retry faster

async function checkHealth(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)
    const res = await fetch(`${BASE}/health`, { signal: controller.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

export default function BackendBanner() {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    async function tick() {
      const ok = await checkHealth()
      setStatus(ok ? 'online' : 'offline')
      timer = setTimeout(tick, ok ? ONLINE_POLL_MS : OFFLINE_POLL_MS)
    }

    tick()
    return () => clearTimeout(timer)
  }, [])

  if (status !== 'offline') return null

  return (
    <div
      role="alert"
      className="w-full bg-amber-950/90 border-b border-amber-700/50 px-4 py-2 flex items-center justify-center gap-2.5"
    >
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
      <p className="text-sm font-medium text-amber-200">
        Live odds temporarily unavailable — reconnecting to servers…
      </p>
      <span className="text-xs text-amber-500 hidden sm:inline">
        · Odds will resume automatically
      </span>
    </div>
  )
}
