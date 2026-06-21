# Real-Time Leaderboard Wheel App

A real-time competition app where students spin a Lucky Wheel to earn points and
climb a live leaderboard, while an admin controls the session and allocates each
student's **spin quota** — all updated instantly over Socket.io.

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
│  │  │  ├─ User.js               # username, role, totalScore, spinsRemaining, spinsExecuted
│  │  │  └─ Session.js            # status, wheelSegments, timestamps
│  │  ├─ routes/
│  │  │  ├─ auth.routes.js        # register / login
│  │  │  ├─ admin.routes.js       # session, wheel-config, users/spins (allocate)
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

- **Spin Quota Management** — each student has a `spinsRemaining` balance and a
  `spinsExecuted` counter. The SPIN button is enabled only while
  `spinsRemaining > 0` and the session is `active`; each spin atomically
  decrements the balance on the backend and locks the button at zero.
- **Admin spin allocation** — admin can **Add** to or **Set** any student's spin
  balance individually, or **Bulk Add / Bulk Set** for all students at once.
- **Real-time quota sync** — allocating spins emits `student:stats:update` to the
  affected student, instantly updating their dashboard and unlocking the button
  with no page refresh.
- **Admin-configurable wheel** — segments (text, value, color) are added/edited/
  deleted from the Admin Dashboard and pushed to students via `wheel:update`.
- **Delayed score sync** — score, spin counts, and the leaderboard update only
  after the wheel animation has fully stopped and the result popup appears.
- **Live leaderboard** — broadcast to all clients on every score change.

## Spin Allocation API

`PUT /api/admin/users/spins`

| Body field | Type   | Notes                                                        |
| ---------- | ------ | ----------------------------------------------------------- |
| `userId`   | string | Target student. **Omit** to apply to all students (bulk).   |
| `amount`   | number | Non-negative spin count.                                    |
| `mode`     | string | `'add'` increments the balance, `'set'` overwrites it.      |

## Socket.io Events

| Event                  | Direction        | Purpose                                              |
| ---------------------- | ---------------- | --------------------------------------------------- |
| `join`                 | client → server  | Join a per-user room and/or the `admins` room       |
| `leaderboard:update`   | server → clients | Updated, sorted student leaderboard                 |
| `session:update`       | server → clients | Session state changed (gates the SPIN button)       |
| `wheel:update`         | server → clients | Wheel segment configuration changed                 |
| `student:stats:update` | server → user    | Student's score + `spinsRemaining`/`spinsExecuted`  |

## Notes

- Admin routes are protected with JWT auth + role authorization middleware.
- Score changes and quota spends are validated server-side before broadcasting.
- Spending a spin is atomic (`spinsRemaining > 0` guard in the update query), so a
  rapid double-click can never spend more spins than the student has.
- Pausing/ending a session disables spinning for everyone but **preserves** each
  student's `spinsRemaining` balance for when the session resumes.
