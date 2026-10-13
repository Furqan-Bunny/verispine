# VeriSpine

An online auction and marketplace platform for medical equipment, with live bidding, seller
onboarding, KYC and an affiliate programme.

## What it does

- **Live auctions.** Bids go over Socket.io, so every watcher sees the same price at the same
  time without refreshing.
- **Sellers, not just listings.** A seller applies, gets verified through KYC, then creates
  auctions and manages their own catalogue.
- **Checkout and payouts** through Stripe.
- **An affiliate programme** with referral tracking and commission.
- **An admin side** for approving sellers, moderating auctions and handling disputes.
- **Transactional email** through Brevo.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, Socket.io |
| Auth and data | Firebase (Auth, Firestore, Admin SDK) |
| Payments | Stripe |
| Email | Nodemailer with Brevo |
| Hardening | express-rate-limit, express-validator |

## Layout

```
frontend/
  src/
    pages/        55 routes: auctions, checkout, dashboard, KYC, affiliate, admin
    components/   Shared UI
    services/     API and Firebase clients
    config/       Environment and Firebase setup
backend/
  routes/         24 route modules
  services/       Auctions, payments, email, notifications
  middleware/     Auth and validation
  scripts/        Seed and maintenance tasks
scripts/          One-off data and migration helpers
```

## Running it

Needs Node 18+, a Firebase project, a Stripe account and a Brevo account.

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend, in another terminal
cd frontend
npm install
npm run dev
```

Both directories take their own `.env`. The backend reads:

```
PORT=5000
FIREBASE_SERVICE_ACCOUNT=
FRONTEND_URL=http://localhost:3000
STRIPE_SECRET_KEY=
BREVO_API_KEY=
BREVO_SMTP_LOGIN=
BREVO_SMTP_PASSWORD=
```

The frontend needs `VITE_API_URL` pointing at the backend, **including the `/api` suffix**.
Leaving the suffix off is the single most common setup mistake here.

## Notes on the design

**Bidding is settled server side.** The client sends an intent, the server decides the
outcome against the current state and broadcasts it. A bid is never trusted because it
arrived with a higher number attached.

**Verification gates the money, not the browsing.** Anyone can look. KYC is required before
a seller can take payment, which keeps the signup funnel open without carrying the risk.

## License

MIT.
