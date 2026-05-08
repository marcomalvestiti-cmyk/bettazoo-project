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
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-[#0D0D11]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">

        {/* Logo — Banner image */}
        <Link href="/" className="shrink-0 flex items-center">
          <Image
            src="/Banner - Bettazoo.png"
            alt="Bettazoo"
            width={320}
            height={160}
            className="h-12 w-auto object-contain"
            priority
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {links.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-3 py-1.5 text-base font-medium rounded-lg transition-colors ${
                  active
                    ? 'text-white bg-[#141419]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#0f0f16]/70'
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

        {/* Right: wallet + hamburger */}
        <div className="flex items-center gap-2 shrink-0">
          <ConnectWallet />

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Chiudi menu' : 'Apri menu'}
            aria-expanded={open}
            className="md:hidden w-10 h-10 flex flex-col items-center justify-center gap-[5px] rounded-lg border border-zinc-700 hover:border-zinc-600 hover:bg-[#141419] transition-colors shrink-0"
          >
            <span className={`block w-5 h-0.5 bg-zinc-400 rounded-full transition-all duration-200 origin-center ${open ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-5 h-0.5 bg-zinc-400 rounded-full transition-all duration-200 ${open ? 'opacity-0 scale-x-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-zinc-400 rounded-full transition-all duration-200 origin-center ${open ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <div className={`md:hidden overflow-hidden transition-all duration-200 ease-in-out ${open ? 'max-h-48' : 'max-h-0'}`}>
        <nav className="border-t border-zinc-800 bg-[#0D0D11] px-4 py-2 space-y-1">
          {links.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center px-3 py-4 rounded-xl text-base font-medium transition-colors ${
                  active
                    ? 'text-white bg-[#141419] border-l-2 border-[#B31A1A] pl-[10px]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#0f0f16]/70'
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
