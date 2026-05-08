'use client'

import Link from 'next/link'
import Image from 'next/image'
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
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">

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

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {links.map(({ href, label }) => {
            const active = pathname === href
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

        <div className="flex items-center gap-2 shrink-0">
          <ConnectWallet />

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="md:hidden w-10 h-10 flex flex-col items-center justify-center gap-[5px] rounded-md border border-slate-700 hover:border-slate-600 hover:bg-slate-800 transition-colors shrink-0"
          >
            <span className={`block w-5 h-0.5 bg-slate-400 rounded-full transition-all duration-200 origin-center ${open ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-5 h-0.5 bg-slate-400 rounded-full transition-all duration-200 ${open ? 'opacity-0 scale-x-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-slate-400 rounded-full transition-all duration-200 origin-center ${open ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      <div className={`md:hidden overflow-hidden transition-all duration-200 ease-in-out ${open ? 'max-h-48' : 'max-h-0'}`}>
        <nav className="border-t border-slate-800 bg-slate-950 px-4 py-2 space-y-1">
          {links.map(({ href, label }) => {
            const active = pathname === href
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
        </nav>
      </div>
    </header>
  )
}
