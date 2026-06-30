// Environment adapter.
//
// Shared modules (config/index.js, utils/logger.js) read build-time env via
// this seam instead of `import.meta.env` (web) or `process.env` (native), so
// the same code runs on both platforms.
//
// The platform MUST call `setEnv()` before any shared module that reads env is
// evaluated:
//   - Web   → frontend/src/initAdapters.js (imported first in main.jsx)
//   - Native→ the Expo app entry (before the first service import)
//   - Tests → frontend/src/__tests__/setup.js (vitest setupFiles)
//
// Until set, `getEnv()` returns an empty object so every consumer falls back to
// its documented default (e.g. API_BASE_URL → "/api").

let _env = {};

/** Inject the platform's env map (web: import.meta.env, native: a plain object). */
export function setEnv(env) {
  _env = env || {};
}

/** Read the current env map. Never throws; returns {} before setEnv() is called. */
export function getEnv() {
  return _env;
}
