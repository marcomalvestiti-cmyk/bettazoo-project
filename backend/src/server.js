require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const { startListener } = require('./services/web3Listener');

const PORT = process.env.PORT || 3001;

async function main() {
  // ── MongoDB: try to connect but NEVER crash the server if it fails ──────────
  try {
    await connectDB();
  } catch (err) {
    console.warn('\n⚠️  MongoDB unavailable:', err.message);
    console.warn('⚠️  Server starting in OFFLINE mode.');
    console.warn('⚠️  DB-dependent routes will return mock/empty data.\n');
  }

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.set('io', io);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
  });

  if (process.env.RPC_URL && process.env.CONTRACT_ADDRESS) {
    try {
      const { ethers } = require('ethers');
      const provider = new ethers.WebSocketProvider(process.env.RPC_URL);
      provider.websocket.on('error', (err) =>
        console.warn('Web3 WebSocket error (Hardhat not running?):', err.message)
      );
      startListener(provider, process.env.CONTRACT_ADDRESS, io).catch((err) =>
        console.warn('Web3 listener error:', err.message)
      );
    } catch (err) {
      console.warn('Web3 listener failed to start:', err.message);
    }
  } else {
    console.warn('RPC_URL or CONTRACT_ADDRESS not set — Web3 listener disabled');
  }

  server.listen(PORT, () =>
    console.log(`\n🚀 Bettazoo backend listening on http://localhost:${PORT}\n`)
  );
}

main().catch((err) => {
  console.error('Unrecoverable startup error:', err);
  process.exit(1);
});
