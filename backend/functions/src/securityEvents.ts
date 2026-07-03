// Security-event recorder — the threat-relevant subset of API activity that
// powers the admin Security page. Full per-request access logging goes to Cloud
// Logging (see api/middleware/requestLog.ts); THIS module persists only the
// events an admin needs to review + filter, into Firestore `securityEvents`.
//
// Design mirrors audit.ts: best-effort, non-blocking, never throws — monitoring
// must never break the request path. High/critical events are additionally
// forwarded to Sentry (no-op unless SENTRY_DSN is set).
//
// PRIVACY — an event record must never contain a password, token, or free-form
// PII. We store the network identity (ip, fingerprint), the caller (uid/role),
// the route, and a small structured `detail` object with codes/counts only.

import { getFirestore } from "firebase-admin/firestore";
import type { Request } from "express";
import { clientIp, ipKey, deviceFingerprint } from "./api/clientMeta";
import { captureError } from "./sentry";

/** Firestore collection holding the reviewable security events. */
export const SECURITY_EVENTS_COLLECTION = "securityEvents";

/** The four threat categories chosen during design, expanded into concrete types. */
export type SecurityEventType =
  // auth / brute-force
  | "auth_failure" // a login attempt failed (bad password / unknown user)
  | "account_lockout" // per-account failure threshold reached
  | "invalid_token" // a request presented an invalid/expired/revoked JWT
  | "otp_abuse" // OTP send/verify rate exceeded
  // authorization abuse
  | "authz_denied" // 403: role gate rejected the caller (privilege probing)
  // rate-limit / flood
  | "rate_limited" // 429: a rate limiter rejected the request
  // malformed input
  | "malformed_input" // 400: zod validation rejected the body/params/query
  | "path_scan" // burst of 404s / unknown routes from one source
  // blocking lifecycle (also surfaced on the page)
  | "blocked_request" // a request was refused because its id/ip/fp is blocked
  | "manual_block"
  | "manual_unblock"
  | "auto_block";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** Default severity per event type (a caller may override per-event). */
const SEVERITY_BY_TYPE: Record<SecurityEventType, Severity> = {
  auth_failure: "low",
  account_lockout: "high",
  invalid_token: "medium",
  otp_abuse: "medium",
  authz_denied: "high",
  rate_limited: "medium",
  malformed_input: "low",
  path_scan: "medium",
  blocked_request: "medium",
  manual_block: "info",
  manual_unblock: "info",
  auto_block: "high",
};

/** Minimal caller shape (avoids a runtime import cycle with middleware/auth). */
interface WithCaller {
  caller?: { uid?: string; claims?: { role?: string; username?: string } };
}

export interface SecurityEventInput {
  /** Override the default severity for this type. */
  severity?: Severity;
  /** Small structured detail — codes/counts only, NEVER secrets or PII. */
  detail?: Record<string, unknown>;
  /** Explicit actor uid (for admin block/unblock events where there is no req). */
  actorUid?: string;
}

/**
 * Record a security event. Fire-and-forget: callers may `void` this. Swallows
 * all errors so a Firestore hiccup can never turn into a 500 on the hot path.
 */
export function recordSecurityEvent(
  type: SecurityEventType,
  req: Request | null,
  input: SecurityEventInput = {}
): void {
  // Whole body guarded — this is called from hot request paths (auth gates,
  // rate limiters, validation) and must NEVER throw, whatever the req shape.
  try {
    recordSecurityEventUnsafe(type, req, input);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[securityEvents] record threw", err);
  }
}

function recordSecurityEventUnsafe(
  type: SecurityEventType,
  req: Request | null,
  input: SecurityEventInput
): void {
  const severity = input.severity ?? SEVERITY_BY_TYPE[type] ?? "info";
  const caller = (req as WithCaller | null)?.caller;

  const record: Record<string, unknown> = {
    type,
    severity,
    ts: Date.now(),
    ip: req ? clientIp(req) : null,
    ipKey: req ? ipKey(clientIp(req)) : null,
    fingerprint: req ? deviceFingerprint(req) : null,
    uid: caller?.uid ?? input.actorUid ?? null,
    role: caller?.claims?.role ?? null,
    username: caller?.claims?.username ?? null,
    method: req?.method ?? null,
    path: req?.path ? redactPath(req.path) : null,
    userAgent: truncate(req?.headers?.["user-agent"], 200),
    detail: input.detail ?? null,
    resolved: false, // admin can mark handled from the Security page
  };

  // Persist (best-effort). Wrap the WHOLE call — getFirestore() itself throws
  // synchronously when no Firebase app is initialized (e.g. in a unit test), and
  // this function must never throw into the request path.
  try {
    getFirestore()
      .collection(SECURITY_EVENTS_COLLECTION)
      .add(record)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[securityEvents] persist failed", err);
      });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[securityEvents] persist threw", err);
  }

  // Forward the serious ones to Sentry (no-op unless configured).
  if (severity === "critical" || severity === "high") {
    captureError(new Error(`security:${type}`), {
      severity,
      type,
      path: record.path,
      role: record.role,
      detail: input.detail,
    });
  }
}

/** Strip a possible per-guest token segment from a path before storing it. */
export function redactPath(path: string): string {
  // Invite/digital tokens are secrets; never persist them in a security record.
  return path
    .replace(/\/(invites?|d|digital)\/(token\/)?[^/]+/gi, "/$1/[redacted]")
    .slice(0, 200);
}

function truncate(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return v.slice(0, max);
}
