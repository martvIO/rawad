// Short-lived, capability-scoped tokens for the live-location SSE stream.
//
// EventSource can't set an Authorization header, so the stream's auth token rides
// in the URL — and a leaked ID token (~1h life) there could be replayed to READ a
// groom's live driver positions (proxy/CDN logs, Referer, history). Instead the
// client mints a SHORT-LIVED (~5-min) HMAC token scoped to ONE groomUid via an
// authenticated POST, then opens the SSE with it. A leak is then bounded to ~5 min
// and to that one groom's read-only GPS (writes are already impossible — the
// stream is GET-only).
//
// Token shape: `groomUid.exp.sig` where sig = base64url(HMAC-SHA256(secret,
// "groomUid.exp")). Firebase UIDs are dot-free, so a plain split on "." is safe.
// Secret: STREAM_TOKEN_SECRET in prod; a per-process ephemeral fallback in dev so
// local dev works without config (mirrors the password-enc key pattern).

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const STREAM_TOKEN_TTL_MS = 5 * 60_000;

let cachedSecret: string | null = null;
function secret(): string {
  if (cachedSecret) return cachedSecret;
  const env = process.env.STREAM_TOKEN_SECRET;
  if (env && env.length >= 16) {
    cachedSecret = env;
    return env;
  }
  // Dev/test fallback: an ephemeral per-process secret. Short-lived stream tokens
  // not surviving a restart is fine; logged once so prod misconfig is visible.
  cachedSecret = randomBytes(32).toString("hex");
  // eslint-disable-next-line no-console
  console.warn(
    "[stream-token] STREAM_TOKEN_SECRET not set — using an ephemeral dev secret.",
  );
  return cachedSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Mint a stream token for `groomUid`, valid for ~5 minutes. */
export function mintStreamToken(groomUid: string, now: number = Date.now()): string {
  const exp = now + STREAM_TOKEN_TTL_MS;
  const payload = `${groomUid}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Verify a stream token is well-formed, unexpired, and scoped to `groomUid`. */
export function verifyStreamToken(
  token: unknown,
  groomUid: string,
  now: number = Date.now(),
): boolean {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== groomUid) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || now > exp) return false;
  const expected = sign(`${uid}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
