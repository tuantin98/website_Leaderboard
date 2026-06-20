const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const connectDB = async () => {
  let uri = process.env.MONGODB_URI;
  let memoryServer;

  try {
    if (!uri) {
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri();
    }

    await mongoose.connect(uri, {
      autoIndex: true,
    });

    console.log('MongoDB connected');
  } catch (error) {
    if (!memoryServer) {
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri();
      await mongoose.connect(uri, {
        autoIndex: true,
      });
      console.log('MongoDB connected using in-memory fallback');
      return;
    }

    throw error;
  }
};

module.exports = connectDB;
