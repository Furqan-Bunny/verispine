/**
 * The single CORS allowlist, shared by the HTTP server and Socket.IO.
 *
 * These were two separate hardcoded lists in the codebase this was derived from,
 * and they had already drifted — the production apex domain was allowed for REST
 * but not for websockets, so live bidding silently fell back to polling in prod.
 * One list, one source.
 *
 * Production origins come from the environment so adding a deploy domain is a
 * config change, not a code change.
 */
const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3010',
  'http://localhost:5173',
];

function buildAllowedOrigins() {
  const project = process.env.FIREBASE_PROJECT_ID;

  // Firebase Hosting serves the same site from both hosts.
  const hosting = project
    ? [`https://${project}.web.app`, `https://${project}.firebaseapp.com`]
    : [];

  return [
    ...(process.env.NODE_ENV === 'production' ? [] : LOCAL_ORIGINS),
    ...hosting,
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    ...String(process.env.EXTRA_CORS_ORIGINS || '').split(',').map(s => s.trim()),
  ]
    .filter(Boolean)
    .map(normalize);
}

function normalize(origin) {
  return String(origin).trim().replace(/\/+$/, '');
}

function isAllowedOrigin(origin) {
  return buildAllowedOrigins().includes(normalize(origin));
}

module.exports = { buildAllowedOrigins, isAllowedOrigin, normalize, LOCAL_ORIGINS };
