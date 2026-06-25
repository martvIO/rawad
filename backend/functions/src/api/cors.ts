// CORS origin policy for the Express API. Extracted from index.ts so the
// allow/deny decision is unit-testable without booting the function.
//
// Posture: FAIL-CLOSED. Unknown cross-origin callers are denied CORS headers (the
// browser blocks the read; same-origin app calls still succeed). The built-in
// always-allowed set covers local dev + the project's own frontends, so a missing
// ALLOWED_ORIGINS env var can never lock out the real app — it only stops opening
// the door to arbitrary origins.

/** Env var listing additional allowed origins, comma-separated. */
const ALLOWED_ORIGINS_ENV = "ALLOWED_ORIGINS";

type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

/**
 * Origins ALWAYS allowed regardless of `ALLOWED_ORIGINS`:
 *   - localhost / 127.0.0.1 on any port (Vite dev server)
 *   - `<anything>.web.app` / `<anything>.firebaseapp.com` (Firebase Hosting)
 *   - the production custom domains `dawa.to` and `invite.dawa.to`
 */
export function isAlwaysAllowedOrigin(origin: string): boolean {
  return (
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.(web\.app|firebaseapp\.com)$/i.test(origin) ||
    origin === "https://dawa.to" ||
    origin === "https://invite.dawa.to"
  );
}

/**
 * Build the CORS origin-checker from `ALLOWED_ORIGINS` (comma-separated, exact
 * match) PLUS the always-allowed set. FAIL-CLOSED: an unknown origin is denied
 * even when `ALLOWED_ORIGINS` is unset — only the always-allowed set passes then
 * (previously an unset var allowed ANY origin). Requests with no Origin header
 * (server-to-server, curl, native WebView) are always allowed.
 */
export function buildCorsOriginCheck() {
  const raw = process.env[ALLOWED_ORIGINS_ENV] ?? "";
  const allowList = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowList.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[api] ALLOWED_ORIGINS is not set — CORS is fail-closed to the built-in " +
        "origins only (localhost, *.web.app/*.firebaseapp.com, dawa.to, " +
        "invite.dawa.to). Set it in functions/.env to allow more prod domains."
    );
  }

  return function originCheck(
    origin: string | undefined,
    cb: CorsOriginCallback
  ): void {
    if (!origin) {
      cb(null, true); // server-to-server, curl, mobile WebView
      return;
    }
    if (isAlwaysAllowedOrigin(origin) || allowList.includes(origin)) {
      cb(null, true);
      return;
    }
    // Disallowed origin: do NOT throw (that becomes a 500 and takes the whole API
    // down for that browser). Deny CORS headers — the browser blocks genuine
    // cross-origin reads, while same-origin requests (the app calling its own
    // /api) still succeed because same-origin needs no CORS headers.
    // eslint-disable-next-line no-console
    console.warn(`[api] CORS: origin not in allowlist: ${origin}`);
    cb(null, false);
  };
}
