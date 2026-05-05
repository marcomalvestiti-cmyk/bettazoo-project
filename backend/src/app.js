const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/orderbook', require('./routes/orderbook'));
app.use('/api/ai',        require('./routes/ai'));
app.use('/api/oracle',    require('./routes/oracle'));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

module.exports = app;
