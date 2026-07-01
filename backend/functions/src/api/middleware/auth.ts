// Authentication middleware for the Express REST API.
//
// Every protected route uses `requireAuth` to verify the incoming
// `Authorization: Bearer <idToken>` header against Firebase Auth via the
// Admin SDK. On success it attaches `req.caller = { uid, claims }` so
// downstream route handlers (and the role-gate middlewares below) can
// authorize the request without re-verifying the token.
//
// What this file does NOT do:
//   - It does not create or refresh tokens. Token minting lives in
//     `routes/auth.ts` which proxies to the Firebase Auth REST API.
//   - It does not enforce business-level access (e.g. "can this groom
//     read /api/guests/:groomUid"). Each route owns that check.

import { Request, Response, NextFunction } from "express";
import { getAuth } from "firebase-admin/auth";
import { DawaClaims } from "../../helpers";
import { recordSecurityEvent } from "../../securityEvents";

/** Bearer scheme prefix in the Authorization header. */
const BEARER_PREFIX = "Bearer ";

/** Allowed roles, mirroring `DawaClaims.role` in `helpers.ts`. */
export type Role = "admin" | "driver" | "groom";

/**
 * Express `Request` extended with the authenticated caller's identity.
 * Downstream handlers should narrow on `req.caller` rather than touching
 * the Authorization header directly.
 */
export interface AuthRequest extends Request {
  caller?: {
    uid: string;
    claims: DawaClaims;
  };
}

/**
 * Extract and verify a Firebase ID token from the Authorization header,
 * then attach `req.caller`. Supports two transports:
 *   1. `Authorization: Bearer <idToken>` (preferred; used by REST + JSON)
 *   2. `?token=<idToken>` query param (used by SSE, since EventSource
 *      cannot set custom headers — see routes/liveLocations.ts).
 *
 * Responds with 401 if the token is missing, malformed, expired, or
 * revoked. Never throws — failures always produce a JSON error response.
 */
export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  try {
    // `checkRevoked: true` rejects tokens revoked via revokeRefreshTokens(),
    // which `adminSetPassword` calls on password resets.
    const decoded = await getAuth().verifyIdToken(token, true);
    req.caller = {
      uid: decoded.uid,
      claims: decoded as unknown as DawaClaims,
    };
    next();
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    const message =
      err instanceof Error && err.message ? err.message : "invalid_token";
    // Expired tokens are normal traffic (the client refreshes + retries), so
    // don't flag them. A REVOKED or malformed/forged token IS worth surfacing.
    if (code !== "auth/id-token-expired") {
      recordSecurityEvent("invalid_token", req, {
        severity: code === "auth/id-token-revoked" ? "high" : "medium",
        detail: { code: code || undefined },
      });
    }
    res.status(401).json({ error: "invalid_token", detail: message });
  }
}

/**
 * Gate a route to admins only. Must be chained AFTER `requireAuth`.
 * Sends 403 if the caller's `role` claim is not `"admin"`.
 */
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.caller?.claims?.role !== "admin") {
    recordSecurityEvent("authz_denied", req, {
      detail: { required: "admin", had: req.caller?.claims?.role ?? null },
    });
    res.status(403).json({ error: "admins_only" });
    return;
  }
  next();
}

/**
 * Gate a route to a specific role. Must be chained AFTER `requireAuth`.
 * Example: `router.post("/", requireAuth, requireRole("driver"), handler)`.
 */
export function requireRole(role: Role) {
  return function roleGate(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void {
    if (req.caller?.claims?.role !== role) {
      recordSecurityEvent("authz_denied", req, {
        detail: { required: role, had: req.caller?.claims?.role ?? null },
      });
      res.status(403).json({ error: "forbidden", required: role });
      return;
    }
    next();
  };
}

/**
 * Gate a route to ANY of the listed roles. Must be chained AFTER
 * `requireAuth`. Convenient when an endpoint serves multiple roles
 * (e.g. groom AND admin can both create invites).
 */
export function requireAnyRole(...roles: Role[]) {
  return function anyRoleGate(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void {
    const role = req.caller?.claims?.role;
    if (!role || !roles.includes(role as Role)) {
      recordSecurityEvent("authz_denied", req, {
        detail: { required: roles.join("|"), had: role ?? null },
      });
      res.status(403).json({ error: "forbidden", allowed: roles });
      return;
    }
    next();
  };
}

/**
 * Pull the ID token off either the Authorization header or the `token`
 * query string. The query-string path exists solely for `EventSource`
 * subscriptions (SSE in `routes/liveLocations.ts`), which has no API
 * to attach custom headers in browsers.
 */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization ?? "";
  if (header.startsWith(BEARER_PREFIX)) {
    return header.slice(BEARER_PREFIX.length).trim() || null;
  }
  // Query-token fallback exists ONLY for EventSource/SSE, which cannot set an
  // Authorization header. Enforce read-only at RUNTIME (not just by comment):
  // restrict it to GET so a token leaked in a URL (proxy/CDN access logs, the
  // Referer header, browser history) cannot be replayed on a state-changing
  // POST/PATCH/DELETE while still valid.
  if (req.method === "GET") {
    const q = req.query?.token;
    if (typeof q === "string" && q.length > 0) return q;
  }
  return null;
}
