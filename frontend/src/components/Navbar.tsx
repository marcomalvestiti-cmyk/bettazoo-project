'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ConnectWallet from './ConnectWallet'

const links = [
  { href: '/', label: 'Exchange' },
  { href: '/placer', label: 'Placer Dashboard' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-emerald-400 font-bold text-lg tracking-tight">
            BETTAZOO
          </Link>
          <nav className="flex gap-4">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`text-sm transition-colors ${
                  pathname === href
                    ? 'text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <ConnectWallet />
      </div>
    </header>
  )
}
