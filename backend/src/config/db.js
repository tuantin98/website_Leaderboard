const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Singleton connection cache. Survives module re-requires (and dev hot-reload)
// by hanging off the global object, so we never open a second pool.
let cached = global.__mongooseConn;
if (!cached) {
  cached = global.__mongooseConn = { conn: null, promise: null, memoryServer: null };
}

// Bounded pool + sane timeouts. A bounded maxPoolSize is what prevents the
// "connection pool exhaustion" freeze under sustained multi-device load.
const connectionOptions = {
  autoIndex: true,
  maxPoolSize: 10,            // cap concurrent sockets to Mongo
  minPoolSize: 1,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  waitQueueTimeoutMS: 10000,  // fail fast instead of hanging when the pool is busy
};

const startMemoryServer = async () => {
  cached.memoryServer = await MongoMemoryServer.create();
  return cached.memoryServer.getUri();
};

const bindConnectionEvents = () => {
  const { connection } = mongoose;
  // Bind once — guard against duplicate handlers across reconnects.
  if (connection.__eventsBound) return;
  connection.__eventsBound = true;

  connection.on('error', (error) => console.error('MongoDB error:', error.message));
  connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  connection.on('reconnected', () => console.log('MongoDB reconnected'));
};

const connectDB = async () => {
  // Reuse the live connection — do NOT open a new one per request/socket.
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    mongoose.set('strictQuery', true);
    bindConnectionEvents();

    cached.promise = (async () => {
      let uri = process.env.MONGODB_URI;
      try {
        if (!uri) uri = await startMemoryServer();
        await mongoose.connect(uri, connectionOptions);
        console.log('MongoDB connected');
      } catch (error) {
        // Real DB unreachable → fall back to an in-memory instance once.
        console.warn('Primary MongoDB unavailable, using in-memory fallback:', error.message);
        const memUri = await startMemoryServer();
        await mongoose.connect(memUri, connectionOptions);
        console.log('MongoDB connected using in-memory fallback');
      }
      return mongoose.connection;
    })();
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null; // allow a later retry instead of caching the failure
    throw error;
  }
  return cached.conn;
};

module.exports = connectDB;
