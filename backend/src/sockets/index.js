const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { corsOrigin } = require('../config/cors');

let io;

// Single source of truth for the sorted student leaderboard.
const buildLeaderboard = () =>
  User.find({ role: 'student' })
    .sort({ totalScore: -1, spinsExecuted: -1, username: 1 })
    .select('-password');

// Broadcast the global leaderboard to every connected client.
const broadcastLeaderboard = async () => {
  if (!io) return null;
  const leaderboard = await buildLeaderboard();
  io.emit('leaderboardUpdated', leaderboard);
  return leaderboard;
};

// Coalesce many near-simultaneous spins into a single delayed broadcast so the
// global leaderboard is only revealed *after* a spinner's wheel has stopped.
// A client ack ('spin:settled') can flush it sooner; this is the safety net.
let pendingBroadcast = null;
const scheduleLeaderboardBroadcast = (delayMs = 5000) => {
  if (pendingBroadcast) return; // a broadcast is already queued — let it cover us
  pendingBroadcast = setTimeout(() => {
    pendingBroadcast = null;
    broadcastLeaderboard().catch((error) => console.error('Leaderboard broadcast failed:', error));
  }, delayMs);
};

// Emit to a single user's private room, keyed by their stable Mongo _id.
// Works regardless of how many tabs/sockets that user has open.
const emitToUser = (userId, event, payload) => {
  if (!io) return;
  io.to(String(userId)).emit(event, payload);
};

// Force every open tab of a user off the site: notify their room, then drop the
// sockets so a deleted account can't keep a live connection.
const forceLogoutUser = (userId) => {
  if (!io) return;
  const room = String(userId);
  io.to(room).emit('forcedLogout', { message: 'Your account has been removed by the Admin.' });
  io.in(room).disconnectSockets(true);
};

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      // Same policy as Express: localhost + any private LAN origin (see config/cors.js).
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Reap dead/zombie connections (e.g. a phone that slept or hard-refreshed)
    // instead of letting them accumulate and leak memory over time.
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Authenticate the socket from the JWT passed in the handshake. We derive the
  // user identity here so room membership never depends on unstable socket.id
  // mappings or client-supplied ids (which broke across tabs / page reloads).
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.role = decoded.role;
      }
    } catch (error) {
      // Invalid token → fall through as an anonymous connection (read-only).
    }
    next();
  });

  io.on('connection', (socket) => {
    // Join the private per-user room immediately on (authenticated) connect.
    if (socket.userId) {
      socket.join(String(socket.userId));
    }
    if (socket.role === 'admin') {
      socket.join('admins');
    }

    // Backward-compatible / explicit join (lets a client re-assert its rooms).
    socket.on('join', ({ userId, role } = {}) => {
      if (userId) socket.join(String(userId));
      if (role === 'admin') socket.join('admins');
    });

    // Client acknowledgement: the spinner's wheel animation has fully stopped,
    // so it is now safe to reveal the new score to everyone else.
    socket.on('spin:settled', () => {
      broadcastLeaderboard().catch((error) => console.error('Leaderboard broadcast failed:', error));
    });

    // Log transport errors so a flaky mobile connection can't silently wedge.
    socket.on('error', (error) => {
      console.error(`Socket ${socket.id} error:`, error.message);
    });

    // On disconnect, leave rooms and strip every listener bound to this socket so
    // nothing referencing it is retained after the connection is gone.
    socket.on('disconnect', (reason) => {
      socket.rooms.forEach((room) => socket.leave(room));
      socket.removeAllListeners();
      if (reason === 'transport error' || reason === 'ping timeout') {
        console.warn(`Socket ${socket.id} dropped: ${reason}`);
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = {
  initSocket,
  getIO,
  broadcastLeaderboard,
  scheduleLeaderboardBroadcast,
  emitToUser,
  forceLogoutUser,
};
