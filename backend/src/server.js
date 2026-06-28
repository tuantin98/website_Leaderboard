const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const { corsOptions } = require('./config/cors');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const studentRoutes = require('./routes/student.routes');
const { initSocket } = require('./sockets');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = initSocket(server);

// Allow localhost + any private LAN origin so devices on the same Wi-Fi
// (http://<laptop-ip>:3000) can call the API. See config/cors.js.
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Centralized Express error handler — every route's `next(error)` lands here so
// a thrown error returns a clean 500 instead of hanging the request.
app.use((err, _req, res, _next) => {
  console.error('Express error:', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// Last-resort safety net: log async errors that escaped a try/catch instead of
// letting them tear down the process (which is what forced server restarts).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

const PORT = process.env.PORT || 5000;
// Bind to 0.0.0.0 so the server is reachable from other devices on the LAN
// (phones, tablets) via the laptop's IPv4 address — not just localhost.
const HOST = process.env.HOST || '0.0.0.0';

connectDB()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT} (reachable on your LAN IP)`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  });

module.exports = { app, server, io };
