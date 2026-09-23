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

## Payment gateway (Razorpay) — multi-artist integration

Each artist connects their **own** Razorpay account so customer payments settle directly into the artist's account — Folyo never holds or moves money. Credentials are stored per-user (`RazorpaySetting`) and encrypted at rest via `server/src/lib/crypto.ts`.

### Data model

- `RazorpaySetting` (`server/prisma/schema.prisma`) — one row per `User`: `keyId` (public), `keySecretEnc` (encrypted), `webhookSecretEnc` (encrypted), `accountId`, `enabled`.
- `Payment` — one row per Razorpay order created for a customer: `userId`, `bookingId`/`bookingRequestId`, `razorpayOrderId`, `razorpayPaymentId`, `amount`, `status` (`created` / `paid` / `failed`).

### Flow

1. Artist clicks **Connect Razorpay** on the Dashboard and enters their Razorpay **Key ID** and **Key Secret** (from their own Razorpay dashboard, Test or Live mode). The secret is encrypted before it's stored — it's never sent back to the browser after saving.
2. Artist copies the shown webhook URL (`/api/webhooks/razorpay/:userId`) into their Razorpay dashboard's Webhooks page, subscribed to `payment.captured` and `payment.failed`, and pastes the webhook secret Razorpay gives them back into the same form.
3. Customer submits a `BookingRequest` via the artist's public booking link (`/book/:slug`); the artist confirms it and sets `totalAmount` / `advanceAmount`, producing a `Booking` with an amount due. If the artist has Razorpay connected, the confirmation email includes a **Pay online** link (`/pay/:slug/:bookingId`).
4. Customer opens that link, sees the amount due, and clicks **Pay**. The backend (`POST /api/public/:slug/bookings/:bookingId/pay`) creates a Razorpay `Order` using *that artist's* Key ID/Secret and records a `Payment` row (`status: created`).
5. The frontend loads Razorpay's Checkout widget with the returned `orderId` and the artist's public `keyId` (the secret never reaches the browser).
6. Customer pays. Razorpay sends a signed **webhook** to Folyo's server — this is the source of truth, not the browser's success callback (which can be spoofed or dropped).
7. The webhook handler (`POST /api/webhooks/razorpay/:userId`) looks up that artist's `webhookSecretEnc`, verifies the HMAC signature against the raw request body, marks the `Payment` as `paid`, and updates the `Booking`'s `paymentStatus`/`advanceAmount` accordingly.

### Diagram

```mermaid
sequenceDiagram
    actor Artist
    actor Customer
    participant Folyo as Folyo API
    participant DB as Postgres
    participant RZP as Razorpay

    rect rgb(240, 240, 250)
    note over Artist,DB: One-time setup, per artist
    Artist->>Folyo: POST /api/settings/razorpay (keyId, keySecret, webhookSecret)
    Folyo->>DB: save RazorpaySetting (secrets encrypted)
    Artist->>RZP: Add webhook URL /api/webhooks/razorpay/:userId in own dashboard
    end

    Artist->>Customer: Share /book/:slug booking link
    Customer->>Folyo: POST /api/public/:slug/requests (BookingRequest)
    Folyo-->>Customer: requestId

    opt Customer pays an advance before the artist even reviews it
    Customer->>Folyo: POST /api/public/:slug/requests/:requestId/pay (amount)
    Folyo->>RZP: orders.create({ amount })
    Customer->>RZP: Checkout / UPI QR
    RZP->>Folyo: webhook payment.captured
    Folyo->>DB: BookingRequest.advanceAmount += amount
    end

    Artist->>Folyo: GET /api/requests (advanceAmount pre-filled from any payment above)
    Artist->>Folyo: POST /api/requests/:id/confirm (sets totalAmount, advanceAmount)
    Folyo->>DB: create Booking
    Folyo-->>Customer: Confirmation email incl. /pay/:slug/:bookingId link

    Customer->>Folyo: GET /api/public/:slug/bookings/:bookingId
    Folyo-->>Customer: amountDue, booking summary

    Customer->>Folyo: POST /api/public/:slug/bookings/:bookingId/pay
    Folyo->>DB: load artist's RazorpaySetting (decrypt keySecret)
    Folyo->>RZP: orders.create({ amount, currency })
    RZP-->>Folyo: orderId
    Folyo->>DB: create Payment (status: created)
    Folyo-->>Customer: { orderId, amount, keyId }

    Customer->>RZP: Razorpay Checkout widget (card/UPI/etc.)
    RZP-->>Customer: Payment success screen

    RZP->>Folyo: POST /api/webhooks/razorpay/:userId — payment.captured (signed)
    Folyo->>DB: decrypt artist's webhookSecret, verify HMAC signature
    Folyo->>DB: update Payment -> paid, update Booking.advanceAmount/paymentStatus
```

### Settings API

All routes require `Authorization: Bearer <token>` and are scoped to the logged-in artist. Mirrors the existing `/api/settings/email` pattern.

- `GET /api/settings/razorpay` — returns `{ configured, keyId, webhookConfigured, enabled }` (never the secrets)
- `POST /api/settings/razorpay` — upserts `{ keyId, keySecret, webhookSecret? }`; `keySecret`/`webhookSecret` are optional on update if one is already saved (keeps the existing one)
- `DELETE /api/settings/razorpay` — removes the artist's saved Razorpay credentials

### Public payment API

No auth — scoped by the artist's `publicSlug` and the specific `bookingId`.

- `GET /api/public/:slug` — creator info: `creatorName`, `razorpayEnabled`, `upiVpa` (used by both the booking-request page and the standalone payment page)
- `GET /api/public/:slug/bookings/:bookingId` — booking summary for the payment page: `venue`, `eventDate`, `totalAmount`, `advanceAmount`, `amountDue`, `paymentStatus`, `razorpayEnabled`, `upiVpa`
- `POST /api/public/:slug/bookings/:bookingId/pay` — creates a Razorpay order for the outstanding `amountDue` using the artist's stored keys; rate-limited per booking; returns `{ orderId, amount, currency, keyId }`
- `POST /api/public/:slug/pay` — booking-independent order creation; takes a client-supplied `{ amount }` (validated, capped at ₹500,000), returns the same `{ orderId, amount, currency, keyId }` shape
- `POST /api/public/:slug/requests/:requestId/pay` — lets a customer pay an advance against a still-`pending` `BookingRequest`, before the artist has priced or confirmed it; also a client-supplied `{ amount }` (capped at ₹500,000). On `payment.captured`, the webhook adds it to `BookingRequest.advanceAmount`, so it shows up pre-filled when the artist opens that request to confirm it (`BookingForm`'s `initial={reviewingRequest}` already reads `advanceAmount`, so no separate change was needed there).

### Webhook

- `POST /api/webhooks/razorpay/:userId` — receives Razorpay's `payment.captured` / `payment.failed` events. The `:userId` segment only selects whose webhook secret to check; the HMAC signature (`x-razorpay-signature` header, verified against the *raw* request body) is what actually authenticates the request. Mounted in `server/src/index.ts` with `express.raw()` ahead of the global `express.json()` so the raw bytes are available for signature verification.
- **Requires a public URL.** Razorpay can't call `localhost`. For local testing, tunnel your dev server (e.g. `ngrok http 4000`) and register the tunnel's HTTPS URL as the webhook; in production, use your deployed backend's URL. The webhook secret isn't generated by Razorpay — you type your own string into Razorpay's "Secret" field when creating the webhook, then paste that same string into Folyo's **Connect Razorpay** modal.

### UPI QR — gateway-free alternative

Alongside the Razorpay checkout flow, an artist can add just their own **UPI ID (VPA)** — no gateway account, no keys, no webhook. The public payment page then renders a UPI QR code (and a `upi://pay?...` deep link) that opens directly in the customer's UPI app (Google Pay, PhonePe, Paytm, etc.) prefilled with the artist's VPA and the exact amount due.

- Stored as a single plain field, `User.upiVpa` — it's a public payment address, not a secret, so it isn't encrypted (unlike the Razorpay/SMTP credentials).
- Settings API: `GET/POST/DELETE /api/settings/upi`, `{ vpa }`, validated against a basic VPA shape (`name@bank`).
- The QR is generated **client-side** (`qrcode` npm package) from data already returned by the existing `GET /api/public/:slug/bookings/:bookingId` response (`upiVpa` field) — no extra network call, and no UPI ID or amount is sent to any third-party QR service.
- Trade-off: there's no webhook for UPI collect-free QR payments, so nothing updates `Booking.paymentStatus` automatically — the artist has to check their UPI app and mark the booking paid themselves. This is shown as an explicit disclaimer on both the settings modal and the payment page.
- Both payment methods can be enabled at once; if only UPI is configured, the Razorpay "Pay Rs.X" button is hidden and only the QR is shown (and vice versa).

### Sharing a QR — with a booking, or standalone

There are two ways an artist can hand a customer a QR code:

1. **Per-booking** (`/pay/:slug/:bookingId`) — sent automatically in the confirmation email once a `BookingRequest` is confirmed into a `Booking`. Amount is fixed to whatever's still due on that specific booking.
2. **Standalone** (`/pay/:slug`) — a single reusable link/QR the artist can put on a business card, Instagram bio, or hand out in person, completely independent of any booking. The customer types in whatever amount they're paying; the backend (`POST /api/public/:slug/pay`) creates a Razorpay order for that amount, capped at ₹500,000 as a sanity check on an open-ended payment link.
3. **Advance, on the booking-request form itself** (`/book/:slug`) — right after a customer submits a booking request, the same page shows an optional "Pay an advance now" section (QR + amount field), tied to that specific `BookingRequest` via `POST /api/public/:slug/requests/:requestId/pay`. Nothing forces them to pay — it's just there for a customer who wants to secure the date immediately, before the artist has even priced it.

Both QR codes are visible to the **artist themselves** in the Dashboard's **UPI QR** modal (`src/pages/Dashboard.tsx`) once they've saved a UPI ID and generated a booking link — that's the actual object they'd screenshot, print, or download (`<a download>`) to share:

- A **direct UPI QR** (`upi://pay?pa=...&pn=...`) — scanning it jumps straight into the customer's UPI app, no web page involved.
- A **payment-page QR** — encodes the `/pay/:slug` URL itself, so scanning it opens Folyo's payment page where the customer can pick Razorpay or UPI and enter an amount.

### Frontend

- `src/pages/PublicBookingPayment.tsx` (route `/pay/:slug/:bookingId`) — shows the amount due for a specific booking and opens Razorpay's Checkout widget (loaded from `checkout.js` at runtime), or a UPI QR, using the order/QR data returned by the backend.
- `src/pages/PublicPayment.tsx` (route `/pay/:slug`) — the booking-independent version: customer enters an amount, then pays via Razorpay or the UPI QR (regenerated live as the amount changes).
- `src/pages/PublicBookingRequest.tsx` (route `/book/:slug`) — after submitting the request, shows the same optional advance-payment section (amount field, Razorpay button, UPI QR) tied to the new `requestId`.
- `src/lib/razorpay.ts` — shared helpers (`loadRazorpayScript`, `buildUpiLink`) used by all three payment pages above, so the Checkout-script loading and UPI deep-link format live in one place.
- Dashboard has **Connect Razorpay** and **UPI QR** buttons/modals (next to the existing **Connect Email** one). The UPI QR modal is also where the artist previews and downloads both QR codes described above, and sees the Razorpay webhook URL to register in their own dashboard.

### Security notes

- Only `keyId` ever reaches the browser; `keySecretEnc` and `webhookSecretEnc` stay server-side, encrypted at rest via `EMAIL_ENCRYPTION_KEY` (shared with the SMTP-password encryption).
- Payment amounts are always computed from the `Booking` record server-side (`totalAmount - advanceAmount`) — never trusted from the client request.
- The webhook endpoint is unauthenticated (Razorpay can't send a JWT) but every payload is signature-verified against the specific artist's webhook secret before it's trusted.
- Webhook processing is idempotent — a `Payment` already marked `paid` is not re-applied on a duplicate delivery.
- The Checkout widget's client-side success callback is only used for immediate UI feedback; the webhook is the sole source of truth for marking a payment complete.
