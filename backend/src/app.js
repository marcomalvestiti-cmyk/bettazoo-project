const express = require('express');
const app = express();

// ── CORS — allow Next.js dev server (and any origin for local dev) ────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json())

// Request timeout — no route should block indefinitely (e.g. hung RPC call)
app.use((req, res, next) => {
  res.setTimeout(30_000, () => {
    const msg = `[${new Date().toISOString()}] [TIMEOUT] ${req.method} ${req.path} timed out after 30s`
    console.error(msg)
    if (!res.headersSent) res.status(503).json({ error: 'Request timed out — try again' })
  })
  next()
})

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.use('/api/orderbook', require('./routes/orderbook'));
app.use('/api/ai',        require('./routes/ai'));
app.use('/api/oracle',    require('./routes/oracle'));
app.use('/api/profile',   require('./routes/profile'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/social',    require('./routes/social'));

// 404 — always JSON (never HTML)
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler — always JSON
app.use((err, _req, res, _next) => {
  console.error('[Express error]', err.stack);
  res.status(500).json({ error: err.message });
});

module.exports = app;
