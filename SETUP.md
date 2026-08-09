# VeriSpine Marketplace — Setup

Everything below is a one-time setup on accounts the client owns. The code is
complete and runs today against mock carriers and mock Stripe; these steps swap
the mocks for live services.

---

## 1. Firebase project

The marketplace needs its own Firebase project — it cannot share one with
another client's data.

```bash
# Firebase Console → Add project → name it (e.g. verispine-marketplace)
# Then enable, in the console:
#   Authentication → Sign-in method → Email/Password
#   Firestore Database → Create (production mode, region us-east1 or nam5)
#   Storage → Get started
```

Deploy the rules and indexes from the repo root:

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # select the new project
firebase deploy --only firestore:rules,firestore:indexes,storage
```

The index build takes a few minutes. Until it finishes, list and admin queries
fall back to unsorted results rather than failing — that is by design, but the
ordering will look wrong, so wait for "Enabled" in the console before testing.

### Backend credentials

Project settings → Service accounts → Generate new private key. Put the whole
JSON on one line:

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"…"}
FIREBASE_PROJECT_ID=verispine-marketplace
FIREBASE_STORAGE_BUCKET=verispine-marketplace.firebasestorage.app
```

### Frontend credentials

Project settings → Your apps → Web app → Config. Copy `frontend/.env.example`
to `frontend/.env` and fill in every `VITE_FIREBASE_*` value. The app throws at
startup if any is missing, rather than failing later with an opaque Firebase
error.

These values are public by design — they ship in the JS bundle. Access control
is enforced by `firestore.rules` and `storage.rules`, not by hiding them.

### Seed

```bash
node backend/scripts/seedCatalog.js --dry-run   # check first
node backend/scripts/seedCatalog.js             # 10 medical/machinery categories

# Then register the admin account through the site, and promote it:
node backend/scripts/setup-admin.js             # edit the email inside first
```

---

## 2. Stripe

Payments run in mock mode until real keys are set, so the whole checkout flow is
testable now. To go live:

1. Create the Stripe account (US business details — this is the long pole;
   onboarding can take days).
2. Backend env:
   ```
   STRIPE_SECRET_KEY=sk_test_…       # sk_live_… in production
   STRIPE_WEBHOOK_SECRET=whsec_…
   STRIPE_MOCK_MODE=false
   ```
3. Frontend env: `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…`
   The secret key must never appear here — it would be published to every visitor.
4. Register the webhook endpoint in the Stripe dashboard:
   `https://<backend-domain>/api/payments/stripe/webhook`
   Events: `checkout.session.completed`, `checkout.session.expired`,
   `charge.refunded`.

**The webhook is the settlement path, not the browser redirect.** If the webhook
is not registered, buyers will pay and their orders will never move past
`pending_payment`. Test with `stripe listen --forward-to localhost:5000/api/payments/stripe/webhook`.

---

## 3. Carriers

Both parcel carriers default to mock mode (`USPS_MOCK_MODE` / `UPS_MOCK_MODE`
are on unless explicitly set to `false`), which produces plausible rates,
tracking numbers and events without an account. Freight needs no credentials at
all — it is quoted and tracked by hand — so **every listing is sellable today**.

To enable real labels:

```
# USPS (developer.usps.com → APIs v3)
USPS_MOCK_MODE=false
USPS_CLIENT_ID=…
USPS_CLIENT_SECRET=…
USPS_ACCOUNT_NUMBER=…

# UPS (developer.ups.com)
UPS_MOCK_MODE=false
UPS_CLIENT_ID=…
UPS_CLIENT_SECRET=…
UPS_ACCOUNT_NUMBER=…
UPS_SERVICE_CODE=03          # 03 = UPS Ground
```

Pick the active carrier in Admin → Shipping. Orders over 150 lbs, or larger than
108" in any dimension, are routed to freight automatically regardless of that
setting — parcel carriers reject those bookings, and finding that out after the
buyer has paid is worse than quoting freight up front.

---

## 4. Email

Resend is already wired. Set:

```
RESEND_API_KEY=re_…
RESEND_SENDER_EMAIL=noreply@<verified-domain>
```

The sender domain must be verified in Resend or every email silently bounces.

---

## 5. Deploy

**Backend — Railway.** New project → deploy from this repo. `nixpacks.toml` and
`railway.json` are configured for Node 20 and `backend/start.js`. Set the full
env set above, plus:

```
NODE_ENV=production
JWT_SECRET=<64 random hex chars>
FRONTEND_URL=https://<frontend-domain>
CLIENT_URL=https://<frontend-domain>
EXTRA_CORS_ORIGINS=            # comma-separated, only if more origins are needed
```

CORS and the Socket.IO allowlist are both derived from `FRONTEND_URL`,
`CLIENT_URL` and `FIREBASE_PROJECT_ID` — there is no hardcoded domain list to
update. In production, localhost origins are dropped automatically.

**Frontend.** `cd frontend && npm run build`, then deploy `frontend/dist` to
Firebase Hosting (`firebase deploy --only hosting`) or Vercel. Set
`VITE_API_URL` to the Railway backend URL.

---

## Before go-live

Two items are outside the build and need the client's sign-off:

**Legal review.** The Terms and Privacy pages were adapted from a South African
deployment. Statute references were converted to their nearest US equivalents,
but that is translation, not compliance. US privacy law is state-by-state
(CCPA/CPRA, VCDPA and others), and the pages have not been reviewed by a US
attorney.

**Medical device resale is regulated.** The FDA regulates refurbished and
reprocessed devices, and several states license medical equipment dealers
separately. This affects what may be listed and what claims a listing can make —
it is a licensing question, not a code change, and it should be settled before
the first listing goes up rather than after.

---

## Verification

Already verified in this repo, with no Firebase or Stripe credentials present:

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `npm run build` | clean production bundle |
| All backend modules load | 47 / 47 |
| Server boots, `/api/health` responds | 200 |
| CORS rejects an unlisted origin | 403 (not 500) |
| Stripe webhook route is mounted ahead of `express.json()` | raw body reaches the handler |
| USPS / UPS / Freight each implement all 8 provider methods | pass |
| Freight routing: 900 lbs → freight, 130" → freight, 3 lbs → parcel | pass |
| Status mapping: "Return to Sender" is not read as "Delivered" | pass |
| Equipment fields reject bad grades and impossible years | pass |

Re-run any of it with:

```bash
cd frontend && npx tsc --noEmit && npm run build
cd backend  && node start.js          # then curl /api/health
```

Then, on the live project, the parts that need real credentials:

1. Register → email OTP → KYC → seller application → admin approve
2. Create one auction listing and one fixed-price listing
3. Bid from a second account → win → checkout → Stripe test card `4242 4242 4242 4242`
4. Order paid → shipment created → admin mark delivered
5. Seller funds move `pendingBalance` → `balance` → withdrawal request → admin approve
6. Replay the Stripe webhook event — the seller must not be credited twice
7. Two concurrent bids at the same price — `currentPrice` must not regress
