'use client'

import { usePathname } from 'next/navigation'
import Navbar from './Navbar'
import BackendBanner from './BackendBanner'
import TestnetBanner from './TestnetBanner'

// /overlay/* pages are OBS Browser Source widgets, not normal site pages — they must
// render with none of the site chrome (nav, banners) so they composite cleanly over
// stream footage. One pathname check here, instead of teaching every chrome
// component about the overlay route.
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isOverlay = pathname?.startsWith('/overlay')

  if (isOverlay) {
    return <main className="flex-1">{children}</main>
  }

  return (
    <>
      <TestnetBanner />
      <Navbar />
      <BackendBanner />
      <main className="flex-1">{children}</main>
    </>
  )
}
