import type { Metadata } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import Navbar from '@/components/Navbar'
import BackendBanner from '@/components/BackendBanner'
import TestnetBanner from '@/components/TestnetBanner'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bettazoo — P2P Sports Betting',
  description: 'Bet peer-to-peer with no bookmaker. USDT stablecoin on Web3.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        <Providers>
          <TestnetBanner />
          <Navbar />
          <BackendBanner />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
