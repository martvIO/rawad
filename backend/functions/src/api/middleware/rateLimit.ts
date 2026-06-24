// Rate-limiting middleware for the Express REST API.
//
// Thin adapter over the existing in-memory `allow()` bucket limiter
// (`../../rateLimit`). Provides two factories:
//
//   - `ipRateLimit`  — keyed by client IP. For public/unauthenticated
//                      endpoints (e.g. login, OTP, public confirmation).
//   - `uidRateLimit` — keyed by authenticated caller UID. For admin
//                      endpoints that need per-user throttling. Must be
//                      chained AFTER `requireAuth` so `req.caller.uid`
//                      is populated.
//
// On exceed: 429 with body `{ error: "too_many_requests", retryAfterMs }`.
//
// What this file does NOT do:
//   - It does not persist counters across Cloud Function cold starts.
//     The underlying `allow()` is in-memory. Acceptable trade-off for
//     a single-instance abuse gate; for stricter cross-instance limits
//     swap the bucket store in `../../rateLimit.ts`.

import { Request, Response, NextFunction } from "express";
import { allow } from "../../rateLimit";
import { allowPersistent } from "../../rateLimitPersistent";
import { rtdbPort } from "../../domain/firebaseAdapters";
import { AuthRequest } from "./auth";

/** Fallback IP key when Express cannot resolve the client address. */
const UNKNOWN_IP_KEY = "unknown";

/** Fallback UID key for anonymous calls that somehow reach a uidRateLimit. */
const ANON_UID_KEY = "anon";

/**
 * Throttle by client IP. Suitable for public endpoints that take no
 * auth (login, password-reset OTP, public confirmation submission).
 *
 * @param prefix     bucket-key namespace (keeps routes from sharing buckets)
 * @param maxPerHour maximum allowed requests in the window
 * @param windowMs   sliding-window duration in milliseconds
 */
/** True when running inside the Firebase local emulator suite. */
const IN_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

export function ipRateLimit(prefix: string, maxPerHour: number, windowMs: number) {
  return function ipGate(req: Request, res: Response, next: NextFunction): void {
    // Skip rate limiting in emulator mode so e2e tests can login freely.
    if (IN_EMULATOR) { next(); return; }
    const ip = resolveClientIp(req);
    const key = `${prefix}:${ip}`;
    if (!allow(key, maxPerHour, windowMs)) {
      res.status(429).json({
        error: "too_many_requests",
        scope: "ip",
      });
      return;
    }
    next();
  };
}

/**
 * Like `ipRateLimit`, but backed by the PERSISTENT (cross-instance) store so the
 * limit survives Cloud Function cold starts. Use ONLY for the security-critical
 * auth surface (login, OTP) where a cold-start bypass is a real brute-force gap;
 * the cheap high-volume limiters stay in-memory. `allowPersistent` fail-opens on a
 * store error, so a limiter outage can't lock out every login. Skipped in the
 * emulator like the others so e2e tests don't trip it.
 */
export function ipRateLimitPersistent(prefix: string, maxPerHour: number, windowMs: number) {
  return async function ipGate(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (IN_EMULATOR) { next(); return; }
    const ip = resolveClientIp(req);
    const allowed = await allowPersistent(rtdbPort(), `${prefix}:${ip}`, maxPerHour, windowMs);
    if (!allowed) {
      res.status(429).json({ error: "too_many_requests", scope: "ip" });
      return;
    }
    next();
  };
}

/**
 * Throttle by authenticated caller UID. Must be chained AFTER `requireAuth`
 * (which sets `req.caller.uid`).
 */
export function uidRateLimit(prefix: string, maxPerHour: number, windowMs: number) {
  return function uidGate(req: AuthRequest, res: Response, next: NextFunction): void {
    if (IN_EMULATOR) { next(); return; }
    const uid = req.caller?.uid ?? ANON_UID_KEY;
    const key = `${prefix}:${uid}`;
    if (!allow(key, maxPerHour, windowMs)) {
      res.status(429).json({
        error: "too_many_requests",
        scope: "uid",
      });
      return;
    }
    next();
  };
}

/**
 * Throttle public token-credential endpoints by the TOKEN, with a generous
 * per-IP backstop. Wedding guests share the venue's NAT IP, so keying these
 * routes by IP alone would rate-limit the whole party as one client; keying
 * by token gives each guest their own bucket while the IP backstop still
 * stops token-rotation floods from a single source. Requests without a
 * token fall back to a per-IP bucket (the route's format check 400s them
 * anyway).
 */
export function tokenRateLimit(
  prefix: string,
  maxPerToken: number,
  windowMs: number,
  ipBackstopMax: number,
) {
  return function tokenGate(req: Request, res: Response, next: NextFunction): void {
    if (IN_EMULATOR) { next(); return; }
    const token = ((req.query?.token ?? req.body?.token) ?? "").toString();
    const ip = resolveClientIp(req);
    const tokenKey = token ? `${prefix}:t:${token}` : `${prefix}:noToken:${ip}`;
    if (!allow(tokenKey, maxPerToken, windowMs)) {
      res.status(429).json({ error: "too_many_requests", scope: "token" });
      return;
    }
    if (!allow(`${prefix}:ip:${ip}`, ipBackstopMax, windowMs)) {
      res.status(429).json({ error: "too_many_requests", scope: "ip" });
      return;
    }
    next();
  };
}

/**
 * Throttle a public endpoint by an arbitrary request-derived key (e.g. the
 * target groomUsername on the confirmation form) with a generous per-IP
 * backstop. Same rationale as `tokenRateLimit`: a wedding venue NATs all its
 * guests behind one IP, so an IP-only cap rate-limits the whole party as one
 * client. Keying by groom gives each wedding its own bucket while the IP
 * backstop still stops a single source from flooding. Requests with an empty
 * key fall back to a per-IP bucket.
 */
export function keyedRateLimit(
  prefix: string,
  keyOf: (req: Request) => string,
  maxPerKey: number,
  windowMs: number,
  ipBackstopMax: number,
) {
  return function keyedGate(req: Request, res: Response, next: NextFunction): void {
    if (IN_EMULATOR) { next(); return; }
    const ip = resolveClientIp(req);
    const raw = (keyOf(req) || "").toString();
    const primaryKey = raw ? `${prefix}:k:${raw}` : `${prefix}:noKey:${ip}`;
    if (!allow(primaryKey, maxPerKey, windowMs)) {
      res.status(429).json({ error: "too_many_requests", scope: "key" });
      return;
    }
    if (!allow(`${prefix}:ip:${ip}`, ipBackstopMax, windowMs)) {
      res.status(429).json({ error: "too_many_requests", scope: "ip" });
      return;
    }
    next();
  };
}

/**
 * Resolve the client IP for rate-limit keying.
 *
 * We deliberately rely on Express's `req.ip`, which is derived from
 * `X-Forwarded-For` using the configured `trust proxy` hop count
 * (see `api/index.ts`). That makes it ignore attacker-prepended XFF
 * entries. We must NOT hand-parse `X-Forwarded-For` and take the leftmost
 * value here — that entry is fully client-controlled, so an attacker could
 * rotate it to land in a fresh rate-limit bucket on every request and bypass
 * the limiter completely. Fall back to the socket peer, then a constant, so
 * the limiter still functions if `req.ip` is unavailable.
 */
function resolveClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || UNKNOWN_IP_KEY;
}
