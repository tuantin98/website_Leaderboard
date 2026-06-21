# Real-Time Leaderboard Wheel App

A real-time competition app where students spin a Lucky Wheel to earn points and
climb a live leaderboard, while an admin controls the session and each student's
permission to spin — all updated instantly over Socket.io.

**Stack:** React + Vite + Tailwind (frontend) · Node.js + Express (backend) ·
MongoDB + Mongoose · Socket.io.

## Project Structure

```text
project_Web_LeaderBoard/
├─ backend/
│  ├─ src/
│  │  ├─ config/
│  │  │  └─ db.js                 # Mongo connection (+ in-memory fallback)
│  │  ├─ middleware/
│  │  │  └─ auth.js               # JWT authenticate + role authorization
│  │  ├─ models/
│  │  │  ├─ User.js               # username, role, totalScore, spinCount, canSpin
│  │  │  └─ Session.js            # status, wheelSegments, timestamps
│  │  ├─ routes/
│  │  │  ├─ auth.routes.js        # register / login
│  │  │  ├─ admin.routes.js       # session, wheel-config, toggle-spin
│  │  │  └─ student.routes.js     # me, leaderboard, session, spin
│  │  ├─ sockets/
│  │  │  └─ index.js              # Socket.io init + per-user room mapping
│  │  └─ server.js                # Express app + HTTP/Socket.io bootstrap
│  ├─ .env.example
│  └─ package.json
└─ frontend/
   ├─ src/
   │  ├─ context/
   │  │  └─ AuthContext.jsx       # auth state + token persistence
   │  ├─ pages/
   │  │  ├─ LoginPage.jsx
   │  │  ├─ RegisterPage.jsx
   │  │  ├─ AdminDashboard.jsx    # session control, wheel config, roster
   │  │  └─ StudentDashboard.jsx  # spin wheel, live stats & leaderboard
   │  ├─ services/
   │  │  └─ api.js                # axios instance (baseURL + auth header)
   │  ├─ App.jsx                  # routes
   │  ├─ main.jsx                 # React entry
   │  └─ index.css                # Tailwind + base styles
   ├─ index.html
   ├─ vite.config.js
   ├─ tailwind.config.js
   ├─ postcss.config.js
   ├─ .env.example
   └─ package.json
```

## Backend Setup

1. Go to the `backend` folder.
2. Create a `.env` file using `.env.example` as a template.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the server:
   ```bash
   npm run dev      # nodemon (development)
   npm start        # node (production)
   ```

The server runs on `http://localhost:5000` by default. If `MONGODB_URI` is not
reachable, it automatically falls back to an in-memory MongoDB
(`mongodb-memory-server`), so data resets on each restart.

### Backend Environment Variables

- `PORT` — HTTP port (default `5000`)
- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — secret used to sign auth tokens
- `CLIENT_URL` — allowed CORS origin (the frontend URL)
- `ADMIN_REGISTRATION_SECRET` — optional secret required to register an admin

## Frontend Setup

1. Go to the `frontend` folder.
2. Create a `.env` file using `.env.example` as a template.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the dev server / build:
   ```bash
   npm run dev      # Vite dev server (http://localhost:3000)
   npm run build    # production build to dist/
   npm run preview  # preview the production build
   ```

### Frontend Environment Variables

- `VITE_API_URL` — backend API base URL (e.g. `http://localhost:5000/api`)
- `VITE_SOCKET_URL` — Socket.io server URL (e.g. `http://localhost:5000`)

## Features

- **Continuous spinning** — students spin back-to-back with no hardcoded cap, as
  long as the session is `active` and the admin has enabled their permission.
- **Real-time permission control** — admin toggles per-student or global spin
  permission; the student's SPIN button enables/disables instantly via Socket.io
  (`spinStatusUpdate`, `user:permission`, `users:permission:update`).
- **Admin-configurable wheel** — segments (label, value, color) are set from the
  Admin Dashboard and persisted on the session.
- **Delayed score sync** — scores, spin counters, and the leaderboard update only
  after the wheel comes to a complete stop.
- **Live leaderboard** — broadcast to all clients on every score change.

## Socket.io Events

| Event                     | Direction        | Purpose                                        |
| ------------------------- | ---------------- | ---------------------------------------------- |
| `join`                    | client → server  | Join a per-user room and/or the `admins` room  |
| `leaderboard:update`      | server → clients | Updated, sorted student leaderboard            |
| `session:update`          | server → clients | Session state changed                          |
| `wheel:update`            | server → clients | Wheel segment configuration changed            |
| `spinStatusUpdate`        | server → clients | Spin permission changed (targeted or global)   |
| `user:permission`         | server → user    | Per-student spin permission toggle             |
| `users:permission:update` | server → clients | Global grant/revoke all                        |
| `student:stats:update`    | server → user    | A student's score/spin count after a spin      |

## Notes

- Admin routes are protected with JWT auth + role authorization middleware.
- Score changes are validated server-side before broadcasting.
- A successful spin only increments score/spin count; spin permission is
  controlled solely by the admin (and the active session state).
