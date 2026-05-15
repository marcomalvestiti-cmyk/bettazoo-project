'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import ConnectWallet from './ConnectWallet'

const NAV_LINKS = [
  { href: '/bet',         label: 'Bet' },
  { href: '/bettor',      label: 'My Bets' },
  { href: '/how-to-play', label: 'How to Play' },
  { href: '/rules',       label: 'Rules' },
]

export default function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  function isActive(href: string) {
    if (href === '/bet')    return pathname === '/bet' || pathname.startsWith('/bet/')
    if (href === '/bettor') return pathname === '/bettor' || pathname.startsWith('/bettor/')
    return pathname === href
  }

  const placerActive = pathname === '/placer' || pathname.startsWith('/placer/')

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">

        {/* Logo */}
        <Link href="/" className="shrink-0 flex items-center">
          <Image
            src="/Logo-Bettazoo.png"
            alt="Bettazoo"
            width={160}
            height={56}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>

        {/* Center nav — bettor links */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  active
                    ? 'text-white bg-slate-800'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-px bg-[#B31A1A] rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right — Placer Area + Get Test Tokens + Connect Wallet */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Link
            href="/placer"
            className={`px-3 py-1.5 text-sm font-semibold rounded-md border transition-colors whitespace-nowrap ${
              placerActive
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-amber-500/50 text-amber-500 hover:border-amber-500 hover:bg-amber-500/10'
            }`}
          >
            ✦ Placer Area
          </Link>
          <Link
            href="/faucet"
            className={`px-3 py-1.5 text-sm font-semibold rounded-md border transition-colors whitespace-nowrap ${
              pathname === '/faucet'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-500/15'
                : 'border-emerald-500/50 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/10'
            }`}
          >
            💧 Get Test Tokens
          </Link>
          <ConnectWallet />
        </div>

        {/* Mobile: wallet always visible + hamburger */}
        <div className="md:hidden flex items-center gap-2 ml-auto shrink-0">
          <ConnectWallet />
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="w-10 h-10 flex flex-col items-center justify-center gap-[5px] rounded-md border border-slate-700 hover:border-slate-600 hover:bg-slate-800 transition-colors shrink-0"
          >
            <span className={`block w-5 h-0.5 bg-slate-400 rounded-full transition-all duration-200 origin-center ${open ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-5 h-0.5 bg-slate-400 rounded-full transition-all duration-200 ${open ? 'opacity-0 scale-x-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-slate-400 rounded-full transition-all duration-200 origin-center ${open ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <div className={`md:hidden overflow-hidden transition-all duration-200 ease-in-out ${open ? 'max-h-72' : 'max-h-0'}`}>
        <nav className="border-t border-slate-800 bg-slate-950 px-4 py-2 space-y-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center px-3 py-3 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'text-white bg-slate-800 border-l-2 border-[#B31A1A] pl-[10px]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {label}
              </Link>
            )
          })}
          <Link
            href="/faucet"
            onClick={() => setOpen(false)}
            className={`flex items-center px-3 py-3 rounded-md text-sm font-semibold border transition-colors ${
              pathname === '/faucet'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-500/15'
                : 'border-emerald-500/40 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/10'
            }`}
          >
            💧 Get Test Tokens
          </Link>
          <Link
            href="/placer"
            onClick={() => setOpen(false)}
            className={`flex items-center px-3 py-3 rounded-md text-sm font-semibold border transition-colors ${
              placerActive
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-amber-500/40 text-amber-500 hover:border-amber-500 hover:bg-amber-500/10'
            }`}
          >
            ✦ Placer Area
          </Link>
        </nav>
      </div>
    </header>
  )
}
