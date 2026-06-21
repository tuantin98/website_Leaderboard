// Shared CORS origin policy for both Express and Socket.io.
//
// Problem this solves: a fixed CLIENT_URL (e.g. http://localhost:3000) makes the
// server reject requests coming from the laptop's LAN IP (http://192.168.0.113:3000),
// so phones/other devices can't log in. Here we allow localhost AND any private
// LAN address, plus any explicit origins listed in CLIENT_URL (comma-separated).

// Read lazily so values from dotenv (loaded after requires) are picked up.
const getExtraAllowed = () =>
  (process.env.CLIENT_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const isPrivateHostname = (hostname) =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  /^10\./.test(hostname) ||                       // 10.0.0.0/8
  /^192\.168\./.test(hostname) ||                 // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);    // 172.16.0.0/12

const isAllowedOrigin = (origin) => {
  // No Origin header → non-browser client (curl, mobile native, same-origin). Allow.
  if (!origin) return true;
  if (getExtraAllowed().includes(origin)) return true;
  try {
    return isPrivateHostname(new URL(origin).hostname);
  } catch (error) {
    return false;
  }
};

// cors-package style callback: echoes the request Origin back when allowed.
const corsOrigin = (origin, callback) => callback(null, isAllowedOrigin(origin));

const corsOptions = {
  origin: corsOrigin,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  credentials: true,
};

module.exports = { corsOptions, corsOrigin, isAllowedOrigin };
