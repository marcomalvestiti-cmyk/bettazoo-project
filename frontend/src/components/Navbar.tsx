'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ConnectWallet from './ConnectWallet'

const links = [
  { href: '/', label: 'Exchange' },
  { href: '/placer', label: 'Placer' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/60 bg-slate-900/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="w-7 h-7 rounded-md bg-green-500 flex items-center justify-center">
            <span className="text-slate-900 font-black text-xs leading-none">BZ</span>
          </span>
          <span className="text-white font-bold text-base tracking-tight hidden sm:block">
            Bettazoo
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1">
          {links.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  active
                    ? 'text-white bg-slate-800'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-px bg-green-400 rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Wallet */}
        <ConnectWallet />
      </div>
    </header>
  )
}
