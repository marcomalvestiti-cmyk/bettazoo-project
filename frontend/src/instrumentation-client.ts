// Client-side error tracking — a no-op until NEXT_PUBLIC_SENTRY_DSN is set (same
// "optional until configured" posture as the backend's SENTRY_DSN). Without this,
// a bug a beta tester hits is only visible if they report it themselves; there's no
// automatic signal at all today. Deliberately minimal: no performance tracing, no
// session replay, no build-time Next.js plugin — just captureException wired to the
// two places an error can reach the top of the page (window.onerror and
// unhandledrejection), which is nearly all of it in an app this client-heavy.
import * as Sentry from '@sentry/browser'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0 })

  window.addEventListener('error', (event) => {
    Sentry.captureException(event.error ?? new Error(event.message))
  })
  window.addEventListener('unhandledrejection', (event) => {
    Sentry.captureException(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason))
    )
  })
}
