// Shared helpers for extracting the client's network identity + device
// fingerprint from a request, used by the security monitoring, block-check,
// and rate-limit-derived layers.
//
// IP RESOLUTION — we deliberately rely on Express's `req.ip`, which is derived
// from X-Forwarded-For using the configured `trust proxy` hop count (see
// api/index.ts). That makes it ignore attacker-prepended XFF entries. We must
// NOT hand-parse X-Forwarded-For and take the leftmost value — that entry is
// fully client-controlled, so an attacker could rotate it to dodge per-IP
// blocks/limits on every request. Fall back to the socket peer, then a
// constant, so the helpers still function if `req.ip` is unavailable.
//
// FINGERPRINT — the frontend sends a best-effort browser device fingerprint in
// the `X-Device-FP` header (see shared apiClient). It is NOT a hardware id and
// is evadable (incognito, another browser, cleared storage); it is only ever a
// weak signal that survives an IP change, never an authoritative identity.

import { Request } from "express";

/** Fallback IP key when Express cannot resolve the client address. */
export const UNKNOWN_IP = "unknown";

/** Header the frontend sends its best-effort device fingerprint on. */
export const FINGERPRINT_HEADER = "x-device-fp";

/** A fingerprint must look like our client hash: hex/base64url, bounded length. */
const FINGERPRINT_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Resolve the client IP for keying (blocks, rate limits, event records). */
export function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || UNKNOWN_IP;
}

/**
 * Turn an IP into an RTDB-safe key. RTDB keys forbid `. # $ [ ] /`, and IPv6
 * addresses contain `:` (legal in a key but awkward), so we replace every
 * non-alphanumeric char with `_`. Deterministic, collision-safe enough for a
 * block-list key namespace.
 */
export function ipKey(ip: string): string {
  return ip.replace(/[^A-Za-z0-9]/g, "_");
}

/**
 * Read + validate the client device fingerprint header. Returns the trimmed
 * value when it matches the expected client-hash shape, else null (so a forged
 * or garbage header can never poison a block-list key or event record).
 */
export function deviceFingerprint(req: Request): string | null {
  const raw = req.headers?.[FINGERPRINT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return FINGERPRINT_RE.test(trimmed) ? trimmed : null;
}
