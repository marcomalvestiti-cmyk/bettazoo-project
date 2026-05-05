'use client'

import { useEffect, useRef, useState } from 'react'

const MOCK_SCORES = [
  '0 - 0', '0 - 0', '0 - 0', '1 - 0', '1 - 0', '1 - 1', '1 - 1', '2 - 1',
]

export default function StreamPlayer({ teamA, teamB }: { teamA: string; teamB: string }) {
  const [minute, setMinute] = useState(1)
  const [scoreIdx, setScoreIdx] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setMinute((m) => Math.min(m + 1, 90))
      setScoreIdx((i) => (i + 1) % MOCK_SCORES.length)
    }, 4000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const score = MOCK_SCORES[scoreIdx]

  return (
    <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
      {/* Video area */}
      <div className="relative bg-zinc-950 aspect-video flex items-center justify-center overflow-hidden">
        {/* HTML5 video placeholder */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
        />
        {/* Field lines */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white" />
          <div className="absolute top-1/4 bottom-1/4 left-1/4 right-1/4 border border-white rounded-full" />
        </div>

        {/* Scoreboard overlay */}
        <div className="relative z-10 text-center">
          <div className="flex items-center gap-4 bg-black/60 backdrop-blur rounded-xl px-6 py-3">
            <span className="text-sm font-medium text-zinc-200 w-24 text-right truncate">{teamA}</span>
            <div className="text-2xl font-bold font-mono text-white">{score}</div>
            <span className="text-sm font-medium text-zinc-200 w-24 text-left truncate">{teamB}</span>
          </div>
          <div className="mt-2 text-xs text-zinc-400">{minute}'</div>
        </div>

        {/* LIVE badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 rounded px-2 py-0.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-xs font-bold text-white">LIVE</span>
        </div>
      </div>
    </div>
  )
}
