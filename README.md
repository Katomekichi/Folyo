# Folyo

Booking Tracking Application For Artist ( MUA | HAIRARTIST | ETC )

A booking ledger app for independent professionals (photographers, event planners, performers, etc.) to track every booking's client, venue, date, and money — advance received vs. full payment — in one place, without juggling notebooks or spreadsheets.

## Features

- Log in with your own account — your bookings are private to you
- Add a booking (client name, venue, event date, total amount, advance received, notes)
- Every booking is automatically listed in a ledger-style table, sorted by date
- Payment status (Pending / Partial / Paid) is computed automatically from advance vs. total
- Summary cards: total bookings, total value, amount collected, balance still due
- Edit or delete any booking

## Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript, PostgreSQL via Prisma, JWT auth
- **Local Postgres**: run via Docker Compose

## Setup

### 1. Database

```bash
docker compose up -d
```

This starts a Postgres container on `localhost:5432` (see [`docker-compose.yml`](docker-compose.yml)). If port 5432 is already in use by another project, stop that container first or change the port mapping here and in `server/.env`.

### 2. Backend

```bash
cd server
cp .env.example .env   # then edit JWT_SECRET to a random string
npm install
npm run prisma:migrate  # creates tables
npm run dev              # starts the API on http://localhost:4000
```

### 3. Frontend

```bash
cp .env.example .env.local   # defaults to http://localhost:4000, fine as-is locally
npm install
npm run dev                   # starts the app on http://localhost:5173
```

Sign up from the app's "Sign up" link, then log in and start adding bookings — each one shows up instantly in your ledger.

## Structure

```
src/                  React app
  pages/              Dashboard (ledger), Login, Signup
  components/         BookingForm (add/edit)
  context/AuthContext.tsx   JWT-based auth state (signup/login/logout, persisted in localStorage)
  lib/api.ts          fetch wrapper that attaches the JWT and talks to the API
  types/               shared TypeScript types matching the API's JSON shape

server/               Express API
  prisma/schema.prisma   database schema (Postgres): User, Booking
  src/routes/            auth, bookings
  src/middleware/auth.ts JWT signing + requireAuth middleware
```

## Auth model

- `POST /api/auth/signup` — creates a `User`, returns a JWT
- `POST /api/auth/login` — returns a JWT
- `GET /api/auth/me` — returns the current user (requires `Authorization: Bearer <token>`)

## Bookings API

All routes require `Authorization: Bearer <token>` and are scoped to the logged-in user.

- `GET /api/bookings` — list all bookings, ordered by event date
- `POST /api/bookings` — create a booking (`clientName`, `venue`, `eventDate`, `totalAmount`, `advanceAmount?`, `notes?`)
- `PATCH /api/bookings/:id` — update a booking
- `DELETE /api/bookings/:id` — delete a booking

Since this project is a React (Vite) frontend + Express/Postgres backend, "hosting for mobile" really means deploying it to the web so it's reachable from a phone browser (no app-store build needed unless you want a native app). Here's the deployment path:

1. Database — hosted Postgres

Pick one (free tiers exist): Supabase, Neon, or Railway. Create a project, grab the connection string (postgresql://user:pass@host:5432/db).

2. Backend — deploy the Express API

Use Render or Railway (easiest for Node + Postgres):
1. Push this repo to GitHub if not already.
2. Create a new Web Service, root directory server.
3. Build command: npm install && npm run build (or npm install if no build step — check server/package.json).
4. Start command: npm start (or node dist/index.js depending on your scripts).
5. Env vars: DATABASE_URL (from step 1), JWT_SECRET (random string), PORT (usually auto-set by host).
6. After first deploy, run the Prisma migration against the hosted DB:
npx prisma migrate deploy
   (run this from your machine with DATABASE_URL pointed at the hosted DB, or add it as a Render "pre-deploy" command).
7. Note the public API URL, e.g. https://folyo-api.onrender.com.

3. Frontend — deploy the React app

Use Vercel or Netlify:
1. Import the repo, root directory = project root (where vite.config.ts is).
2. Build command: npm run build, output dir: dist.
3. Set env var VITE_API_URL (or whatever your .env.local key is) to the backend URL from step 2.
4. Deploy — you get a public URL like https://folyo.vercel.app.

4. CORS

In server/src make sure CORS allows your frontend's deployed origin (not just localhost:5173).

5. Use on mobile

Just open the Vercel/Netlify URL in the phone's browser — since it's a responsive web app, no app store needed. Optionally add "Add to Home Screen" for an app-like icon.

---

Want me to check the actual server/package.json scripts and CORS config so I can give you exact build/start commands instead of the generic ones above?
