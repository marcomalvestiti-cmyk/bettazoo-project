'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import ConnectWallet from './ConnectWallet'

const links = [
  { href: '/', label: 'Exchange' },
  { href: '/placer', label: 'Placer' },
]

export default function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-[#2b2d31]/98 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.5)]">
            <span className="text-white font-black text-xs leading-none">BZ</span>
          </span>
          <span className="text-white font-bold text-base tracking-tight hidden sm:block">
            Bettazoo
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {links.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  active
                    ? 'text-white bg-[#313338]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#313338]/70'
                }`}
              >
                {label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-px bg-purple-400 rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right side: wallet + hamburger */}
        <div className="flex items-center gap-2 shrink-0">
          <ConnectWallet />

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Chiudi menu' : 'Apri menu'}
            aria-expanded={open}
            className="md:hidden w-10 h-10 flex flex-col items-center justify-center gap-[5px] rounded-lg border border-zinc-700 hover:border-zinc-600 hover:bg-[#313338] transition-colors shrink-0"
          >
            <span className={`block w-5 h-0.5 bg-zinc-400 rounded-full transition-all duration-200 origin-center ${open ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-5 h-0.5 bg-zinc-400 rounded-full transition-all duration-200 ${open ? 'opacity-0 scale-x-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-zinc-400 rounded-full transition-all duration-200 origin-center ${open ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown — animated height */}
      <div className={`md:hidden overflow-hidden transition-all duration-200 ease-in-out ${open ? 'max-h-40' : 'max-h-0'}`}>
        <nav className="border-t border-zinc-800 bg-[#2b2d31] px-4 py-2 space-y-1">
          {links.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center px-3 py-3.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'text-white bg-[#313338] border-l-2 border-purple-400 pl-[10px]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#313338]/70'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
