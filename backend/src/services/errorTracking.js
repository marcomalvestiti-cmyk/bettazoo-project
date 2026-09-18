// Thin Sentry wrapper — every call is a no-op until SENTRY_DSN is set (same
// "optional until configured" posture as ODDS_API_KEY/PROTOCOL_TREASURY_ADDRESS).
// Without this, the only way to learn about a crash was reading Railway logs by
// hand — the crash guards in server.js already keep the process alive through an
// uncaught error, but nothing surfaced that it happened unless someone went looking.
const Sentry = require('@sentry/node');

let enabled = false;

function initErrorTracking() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.warn(`[${new Date().toISOString()}] [ErrorTracking] SENTRY_DSN not set — errors are logged to console only`);
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0, // errors only — no performance tracing, keeps this cheap on the free tier
  });
  enabled = true;
  console.log(`[${new Date().toISOString()}] [ErrorTracking] Sentry initialized`);
}

function captureException(err, context) {
  if (enabled) Sentry.captureException(err, context ? { extra: context } : undefined);
}

module.exports = { initErrorTracking, captureException };
