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
      const url = process.env.RPC_URL;
      let provider;
      if (url.startsWith('wss://') || url.startsWith('ws://')) {
        provider = new ethers.WebSocketProvider(url);
        provider.websocket?.on('error', (err) =>
          console.warn('[Web3] WebSocket error:', err.message)
        );
        console.log('[Web3] Using WebSocketProvider');
      } else {
        provider = new ethers.JsonRpcProvider(url);
        console.log('[Web3] Using JsonRpcProvider (HTTP polling)');
      }
      // Store contract address on app so /api/admin/resync can reach it
      app.set('rpcUrl', url);
      app.set('contractAddress', process.env.CONTRACT_ADDRESS);
      startListener(provider, process.env.CONTRACT_ADDRESS, io).catch((err) =>
        console.warn('[Web3] Listener error:', err.message)
      );
    } catch (err) {
      console.warn('[Web3] Listener failed to start:', err.message);
    }
  } else {
    console.warn('[Web3] RPC_URL or CONTRACT_ADDRESS not set — listener disabled');
  }

  server.listen(PORT, () =>
    console.log(`\n🚀 Bettazoo backend listening on http://localhost:${PORT}\n`)
  );
}

main().catch((err) => {
  console.error('Unrecoverable startup error:', err);
  process.exit(1);
});
