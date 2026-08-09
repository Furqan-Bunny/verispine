# VeriSpine Marketplace — White-Label of Quicksell (US)

## Context

Client **VeriSpine Joint Centers** (pain-management clinic chain, 6 locations in Metro Atlanta, Georgia USA) wants to sell and auction **medical products and machinery**. Rather than build from scratch, we white-label the existing **Quicksell** auction/marketplace platform (`E:\Quicksell`) — keeping 100% of its functionality — and re-skin it in VeriSpine's brand.

Two things force real work beyond a find-and-replace:

1. **Quicksell is hard-wired for South Africa.** ZAR currency, 73 SA cities, `+27` phone regex, 4-digit SA postal codes, 9 SA provinces — and critically, **every payment gateway (AddPay, Traderoot) and every courier (SAPO, RTT/CourierIT, Pargo, ShipLogic) is South-Africa-only** and does not operate in the USA. A straight copy would be non-functional for this client.
2. **Data must be isolated.** A separate client cannot share Quicksell's Firestore.

Outcome: a standalone, US-ready marketplace at `E:\VeriSpine`, visually matched to verispinejointcenters.com, with independent data and deployment.

## Decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Folder | `E:\VeriSpine`, fresh git repo (no Quicksell history) |
| Brand name | **VeriSpine Joint Centers** |
| Palette | Exact VeriSpine tokens (extracted from their live CSS) |
| Scope | Marketplace only — no Services/Conditions/Locations marketing pages |
| Database | **New Firebase project**; all other 3rd-party keys reused where still applicable |
| Region | **Full US localization** — USD, US states/ZIP, US phone, Stripe, US carriers |
| Deploy | New Railway project + new domain |

## Brand tokens (extracted from `verispinejointcenters.com/_next/static/css/b8eeb3028c216f05.css`)

```
navy   #0B2A45   navy-mid #133859   navy-light #1E4F7A     → primary
teal   #1A8C7A   teal-light #22B89E                        → secondary
gold   #C9973A   gold-light #E5B86A                        → accent
cream  #F7F4EF   cream-dark #EDE8DF                        → surfaces
```
Their site is Next.js + Tailwind; ours is Vite + React + Tailwind — tokens map directly onto `tailwind.config.js`.

---

## Phase 0 — Scaffold

Copy `E:\Quicksell` → `E:\VeriSpine`, **excluding**: `node_modules/`, `.git/`, `frontend/dist/`, `.vite/`, all `.env*` files, and the ~40 stray root artifacts (`*.pdf`, `*.docx`, `*.xlsm`, `nul`, `backend/nul`, `backend/.env.bak.*`, `mobile/`).

Then delete dead weight that must not enter a fresh codebase:
- `server-unified.js`, `start-railway.js`, `health-check.js`, root `firestore.indexes.json` (unused duplicate — `backend/firestore.indexes.json` is the deployed one), `backend/vercel.json`, `frontend/firebase.json`
- `frontend/src/services/firebaseProducts.ts` (dead — everything goes через `/api/*`)
- `frontend/public/{check-firebase,quick-setup,seed,test-auth}.html` (dev scratch pages, publicly served)
- Stale docs: `PAYMENT_CONFIGURATION.md` (contains live PayFast creds), `RAILWAY_DEPLOY.md`, `SAPO_*.md`, `PROJECT_COMPLETION_PLAN.md`

`git init` + fresh `.gitignore` that **actually ignores `frontend/.env*`** (Quicksell's leaks them — `frontend/.env`, `.env.production`, `.env.development` are all tracked with live keys).

## Phase 1 — Brand

**Theme** — `frontend/tailwind.config.js`: replace the orange `primary` and blue `secondary` ramps with navy/teal 50→950 ramps generated from the tokens above; add `accent` (gold) and `cream`. Extend `fontFamily` — VeriSpine reads as a serif-display + sans-body pairing.

**Component classes** — `frontend/src/index.css`: `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.card`, `.badge`, `.loading-spinner`, `.text-gradient`, `.bg-gradient-primary/secondary` all reference `primary-*`/`secondary-*`, so they re-skin automatically once the ramps change. Only `.text-gradient` needs a hand-tuned navy→teal stop.

**Logo** — Quicksell has **no logo file at all**; `frontend/index.html` references `/logo.svg` which doesn't exist (broken favicon today). Create `frontend/public/logo.svg` + `favicon.ico` + light/dark variants. `Navbar.tsx` and `Footer.tsx` currently render a Heroicons `ShoppingBagIcon` + text — swap for the real mark.

**Strings** — 26 frontend + 40 backend files contain "Quicksell". Highest density: `backend/services/resendEmailService.js` (31 — ~30 email templates, plus header gradient colors and the footer domain), `frontend/src/pages/Terms.tsx` (62), `FAQ.tsx` (22). Also `frontend/index.html` `<title>`, `frontend/package.json` name, `backend/package.json`, `AdminLayout.tsx`, `Footer.tsx`, invoice generators (`utils/orderPdfExport.ts`, `utils/reportExport.ts`).

Regenerate `brand-colors.json` + `BRAND_COLORS_GUIDE.md` for the new palette (they exist and are Quicksell-specific).

**Contact** — `info@quicksellsa.co.za` → client's address; footer social links, phone `+27 21 300 2030` → their Georgia numbers.

## Phase 2 — US localization

Centralize what is currently scattered, then swap it — this is the highest-bug-risk phase, so it goes through **one config module**, not 38 individual edits.

Create `frontend/src/config/locale.ts` + `backend/utils/locale.js` exporting currency, locale string, address schema and validators. Then:

- **Currency** — `frontend/src/utils/formatters.ts` `formatPrice()` is the main entry (`'R '` prefix). 38 `en-ZA` usages and 20 files referencing `ZAR` → `en-US` / `USD` / `$`. Watch the ones inside email HTML (`resendEmailService.js`) and PDF generators, which build strings manually rather than via `formatPrice`.
- **Address** — replace SA provinces with US states in `Checkout.tsx`, `CreateAuction.tsx`, `EditProduct.tsx`, `BecomeSeller.tsx` and both seed scripts. Postal `^\d{4}$` → US ZIP `^\d{5}(-\d{4})?$` in `frontend/src/utils/sapoValidation.ts` and `backend/utils/sapoValidation.js` (rename these to `addressValidation` — the SAPO name stops making sense).
- **Phone** — `SA_PHONE_RE = /^(\+27|0)[1-9][0-9]{8}$/` → US format in the same two files.
- **City restriction** — `backend/utils/cityRestriction.js` (73 SA cities) and `frontend/src/config/cities.ts` are a deliberate SA-only stopgap. **Remove entirely** and drop the call sites in `bids-firebase.js` and `orders-firebase.js`; delete `components/CitySelect.tsx` usage in favour of free-text city + state dropdown. Nationwide US shipping makes the gate meaningless.
- **Weight** — `WEIGHT_MIN_KG`/`WEIGHT_MAX_KG` (0.1–30 kg) → lbs, and raise the ceiling: **machinery is heavy**, the 30 kg cap and the single-parcel assumption in `orders-firebase.js` will reject legitimate orders.

## Phase 3 — Payments (Stripe)

Remove `routes/payments-addpay.js`, `routes/payments-traderoot.js`, `services/addpay.js`, `services/traderootService.js`, `frontend/src/services/traderootService.ts`, `pages/TraderootCallback.tsx`, and the stale `frontend/src/services/payment.ts` (already dead — points at endpoints that don't exist).

Add `backend/routes/payments-stripe.js` (Checkout Session + webhook) **modelled directly on `payments-traderoot.js`**, which already factors the post-payment work into a reusable `runPostPaymentPipeline(orderId, paymentData)`. Reuse unchanged:

- `utils/productPurchase.finalizeProductAfterPurchase` — atomic stock decrement / sold-marking
- `utils/affiliateCommission.processAffiliateCommission`
- `utils/sellerPayout.js` — `PLATFORM_FEE_RATE = 0.10`, hold-until-delivered
- `utils/walletTopup.creditWalletTopup` — idempotent wallet credit
- `services/shippingService` facade — shipment creation on payment

Wallet stays as-is (it is gateway-agnostic); top-up switches from AddPay/Traderoot to Stripe. `payments-firebase.js` `validMethods` → `['balance','stripe']`. Frontend `Checkout.tsx` payment-method block → Wallet + Stripe.

Stripe webhook signature verification requires the **raw body** — needs an `express.raw()` mount *before* `express.json()` in `server.js` for that one route. Easy to get wrong; call it out in testing.

## Phase 4 — Shipping (US carriers)

`services/shippingService.js` is already a clean facade: `providerByName()` dispatches on a stored carrier, and every provider implements the same 8-method contract (`createShipmentForOrder`, `calculateShippingRate`, `trackItems`, `cancelShipment`, `markAsDelivered`, `updateMailItemEvent`, `generateTrackingNumber`, `submitMailItem`). **This is the key reuse point — the abstraction survives the region change intact.**

Delete the 4 SA providers (`sapoShippingService`, `rttShippingService`, `rttRateService`, `pargoShippingService`, `shiplogicShippingService`) plus `backend/data/rtt-*.json`. Add:

- `services/uspsShippingService.js` / `services/upsShippingService.js` — same contract
- `services/freightQuoteService.js` — **manual/seller-quoted freight for machinery.** Heavy equipment doesn't ship parcel; without this, large listings are unsellable.

Update `utils/shippingSettings.js` provider whitelist and `AdminShipping.tsx`'s 4-way toggle. Keep `utils/parcelDimensions.js` (convert cm→in).

## Phase 5 — New Firebase project

Create project, enable Auth (email/password), Firestore, Storage. Then:
- Deploy `firestore.rules` (fix the gaps first — no rules exist today for `withdrawals`, `reviews`, `walletTransactions`, `payments`; `notifications` create is unrestricted so any authed user can write to any recipient)
- Deploy `backend/firestore.indexes.json` (17 composite indexes)
- `storage.rules` — and **stop `makePublic()` on KYC ID documents and selfies** (`backend/routes/kyc.js`); use signed URLs. Publicly-readable government ID scans is a live privacy problem in the current codebase and must not be inherited.
- New service account → `FIREBASE_SERVICE_ACCOUNT` in backend env; new web config → `frontend/.env*`
- Seed admin user + categories

## Phase 6 — Catalog for medical / machinery

Seed categories replacing the current generic set: Imaging Equipment, Surgical Instruments, Patient Monitoring, Rehab & Physical Therapy, Exam Room Furniture, Diagnostic Devices, Consumables & Disposables, Lab Equipment, Sterilization, Spare Parts.

Product model additions (`products-firebase.js` create/update + `CreateAuction.tsx`): manufacturer, model number, year, condition grade (New / Refurbished / Used–Working / For Parts), serial number, compliance/certification notes. Reuse the existing `specifications` JSON field where possible rather than adding columns.

## Phase 7 — Carry-over bug fixes

These are real defects in Quicksell today (verified this session). They must be fixed in the clone rather than inherited, since the requirement is bug-free.

**Dead endpoints (frontend calls routes that don't exist → silent 404):**
- `AdminOrders.handleAddTracking` → `PUT /api/admin-ext/orders/:id/tracking` — build the route
- `AdminOrders.handleAddNotes` → `PUT /api/admin-ext/orders/:id/notes` — build the route
- `AdminOrders.handleBulkStatusUpdate` → `PUT /api/admin-ext/orders/bulk/status` — build the route
- `MyAuctions.handleEndAuction` → `PUT /api/products/:id/end` but the route is **POST** (`products-firebase.js:845`) — fix the verb

**Security:**
- `socketService.js` `place-bid` is **unauthenticated** — trusts client-supplied `userId`/`userName`, so a user can bid as anyone. Add token verification.
- `products-firebase.js` `PUT /:id` mass-assignment — spreads `req.body`, only strips `listingType`/`stockType`; a client can set `sellerId`, `status`, `winnerId`, `soldQuantity`, `featured`. Whitelist fields.
- Remove public `GET /products/test-firestore` (leaks collection names + projectId)
- `auth.js /login` has no `emailVerified` gate
- Socket.io CORS must list the new production domain (Quicksell's omits its own apex today)

**Correctness:**
- `bidsCount` vs `totalBids` field drift — socket path writes `bidsCount`, REST path writes `totalBids`, UI reads both inconsistently. Standardize on `totalBids`.
- `bids-firebase.js:224` calls `req.app.get('io')` but `server.js` registers `app.set('socketService', …)` — REST-placed bids **never broadcast live**. Wire correctly.
- `Checkout.processPayment` creates the order *before* the wallet-balance check → orphan `pending_payment` orders. Reorder.
- `orders-firebase.js /admin/all` `totalCommission` hardcodes 5% while the platform fee is 10%.
- Invoice email: decorative "VAT (15%)" line (SA tax, wrong for US) and hardcoded "Shipping (SAPO)" / "SAPO (South African Post Office)" carrier text.
- `OrderDetail.tsx`: dead `mockOrder` constant and a hardcoded "QuickSell Platform / All products are sold directly by QuickSell" seller card that ignores the real seller.
- `EditProduct.tsx` uses `URL.createObjectURL` for new images — **not a real upload**, images silently lost on save.
- Reconcile `heldBalance` (withdrawals) vs `pendingBalance` (seller payouts) — two competing "held funds" fields; withdrawal approval only checks `balance`, never whether funds are still held pending delivery.
- Remove `crypto ^1.0.1` from `backend/package.json` (shadows the Node built-in).

## Phase 8 — Deploy

New Railway project (`nixpacks.toml` + `railway.json` carry over; Node 20). Set the full env set: new Firebase service account, `JWT_SECRET`, Stripe keys, Resend (reused), carrier keys, `FRONTEND_URL`/`SERVER_URL`/`CLIENT_URL` → new domain. Update `server.js` CORS allowlist and helmet CSP (drop `*.pargo.co.za`, add Stripe domains).

---

## Verification

1. `cd frontend && npm run type-check && npm run build` — zero TS errors, clean production bundle
2. `cd backend && node -e "require('./server.js')"` — boots, all 26 routes load
3. **Grep gates:** zero matches for `quicksell` (case-insensitive), `ZAR`, `en-ZA`, `SAPO`, `traderoot`, `addpay`, `pargo`, `+27` outside of migration notes
4. **E2E happy path on the new Firebase project:** register → verify email (OTP) → KYC → seller application → admin approve → create fixed-price listing → create auction listing → bid from a second account → win → checkout → Stripe test card `4242…` → order paid → shipment created → admin mark delivered → seller funds released `pendingBalance` → `balance` → withdrawal request → admin approve
5. **Auction lifecycle:** scheduled auction activates via the 60s scheduler; payment deadline reminders (48h/24h/4h) fire; expired payment cancels order and re-lists product
6. **Regression on the 4 fixed endpoints:** admin add-tracking, add-notes, bulk-status, seller End-Early all return 200
7. **Bid race:** two concurrent bids at the same price — `currentPrice` must not regress, exactly one `active` bid remains
8. Stripe webhook replay (idempotency — a duplicated event must not double-credit the seller)
9. Lighthouse pass + mobile responsive check

## Risks / open items

- **Stripe account** — client must supply US business details; onboarding can take days. Wallet-only fallback keeps the site usable meanwhile.
- **USPS/UPS API credentials** — client-owned; until issued, the freight/manual-quote path covers all listings.
- **Machinery freight** is genuinely not parcel shipping. The manual-quote path is the primary flow for large equipment, not a fallback.
- **Medical device resale is regulated in the US** (FDA rules on refurbished/reprocessed devices, state licensing). Out of scope for the build, but the client needs legal sign-off before going live — flagging so it isn't discovered late.
- Terms/Privacy/HIPAA copy is Quicksell's SA text; needs US-lawyer review, not translation.

## First action on approval

Create `E:\VeriSpine\` and save this plan as `E:\VeriSpine\PLAN.md`, then begin Phase 0.
