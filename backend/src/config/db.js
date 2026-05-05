const mongoose = require('mongoose');

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/bettazoo';
  await mongoose.connect(mongoUri);
  console.log(`MongoDB connected: ${mongoUri}`);
}

module.exports = connectDB;
