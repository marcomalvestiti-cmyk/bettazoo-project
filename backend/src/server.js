require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const { startListener } = require('./services/web3Listener');

const PORT = process.env.PORT || 3001;

async function main() {
  await connectDB();

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.set('io', io);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
  });

  if (process.env.RPC_URL && process.env.CONTRACT_ADDRESS) {
    const { ethers } = require('ethers');
    const provider = new ethers.WebSocketProvider(process.env.RPC_URL);
    startListener(provider, process.env.CONTRACT_ADDRESS, io).catch(console.error);
  } else {
    console.warn('RPC_URL or CONTRACT_ADDRESS not set — Web3 listener disabled');
  }

  server.listen(PORT, () => console.log(`Bettazoo backend listening on :${PORT}`));
}

main().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
