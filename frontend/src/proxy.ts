import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // /admin/* (internal tooling) and /overlay/* (OBS browser-source widget, not
  // human-browsed) intentionally stay outside locale routing — see the
  // app/(system) route group, which has its own unlocalized root layout.
  matcher: ['/((?!api|admin|overlay|_next|_vercel|favicon.ico|.*\\..*).*)'],
}
