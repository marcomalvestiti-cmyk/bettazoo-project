const mongoose = require('mongoose');

// When DB is offline, fail immediately instead of buffering for 10s
mongoose.set('bufferCommands', false);

// Strips user:password@ out of a connection string before it ever reaches a log —
// the unmasked URI was printed on every boot (Railway logs), credentials in clear
// text for anyone with log access.
function maskCredentials(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@');
}

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/bettazoo';
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000,
    socketTimeoutMS: 5000,
  });
  // Re-enable buffering now that we're connected
  mongoose.set('bufferCommands', true);
  console.log(`✅ MongoDB connected: ${maskCredentials(mongoUri)}`);
}

module.exports = connectDB;
