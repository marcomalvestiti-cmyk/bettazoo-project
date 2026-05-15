const mongoose = require('mongoose');

// When DB is offline, fail immediately instead of buffering for 10s
mongoose.set('bufferCommands', false);

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/bettazoo';
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000,
    socketTimeoutMS: 5000,
  });
  // Re-enable buffering now that we're connected
  mongoose.set('bufferCommands', true);
  console.log(`✅ MongoDB connected: ${mongoUri}`);
}

module.exports = connectDB;
