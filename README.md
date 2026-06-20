# Real-Time Leaderboard Wheel App

## Project Structure

```text
project_Web_LeaderBoard/
├─ backend/
│  ├─ src/
│  │  ├─ config/
│  │  │  └─ db.js
│  │  ├─ middleware/
│  │  │  └─ auth.js
│  │  ├─ models/
│  │  │  ├─ User.js
│  │  │  └─ Session.js
│  │  ├─ routes/
│  │  │  ├─ auth.routes.js
│  │  │  ├─ admin.routes.js
│  │  │  └─ student.routes.js
│  │  ├─ sockets/
│  │  │  └─ index.js
│  │  └─ server.js
│  ├─ .env.example
│  └─ package.json
└─ frontend/ (to be added)
```

## Backend Setup

1. Go to the backend folder.
2. Create a `.env` file using `.env.example` as a template.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the server:
   ```bash
   npm run dev
   ```

## Environment Variables

- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_URL`

## Notes

- Admin routes are protected using JWT middleware.
- Socket.io events are used for instant updates.
- Score changes are validated server-side before broadcasting.
