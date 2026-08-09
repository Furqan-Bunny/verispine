const path = require('path');

/**
 * Load backend/.env regardless of the working directory.
 *
 * Bare `dotenv.config()` resolves against process.cwd(), so it only found the
 * file when the process happened to be started from inside backend/. The root
 * `npm start` runs `node backend/start.js` from the repo root, which silently
 * loaded nothing — the server then came up with no Firebase config and no
 * JWT_SECRET and blamed the environment. Anchoring to __dirname removes the
 * dependency on how the process was launched.
 *
 * Platform-provided variables (Railway, CI) still win: dotenv never overwrites
 * a variable that is already set.
 */
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {};
