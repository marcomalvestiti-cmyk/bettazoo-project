import type { Metadata } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import '../globals.css'
import Providers from '../providers'
import SiteChrome from '@/components/SiteChrome'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bettazoo — P2P Sports Betting',
  description: 'Bet peer-to-peer with no bookmaker. USDT stablecoin on Web3.',
}

// Root layout for /admin/* and /overlay/* — internal tooling and the OBS overlay
// widget, neither ever localized (see src/proxy.ts matcher). Fixed to English so
// shared components (Navbar, SiteChrome, ...) can always call next-intl hooks
// without special-casing whether they're rendered here or under [locale].
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  const messages = (await import('../../../messages/en/common.json')).default

  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        <NextIntlClientProvider locale="en" messages={messages}>
          <Providers>
            <SiteChrome>{children}</SiteChrome>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
