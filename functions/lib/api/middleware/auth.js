"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
exports.requireRole = requireRole;
exports.requireAnyRole = requireAnyRole;
const auth_1 = require("firebase-admin/auth");
/** Bearer scheme prefix in the Authorization header. */
const BEARER_PREFIX = "Bearer ";
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
async function requireAuth(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        res.status(401).json({ error: "unauthenticated" });
        return;
    }
    try {
        // `checkRevoked: true` rejects tokens revoked via revokeRefreshTokens(),
        // which `adminSetPassword` calls on password resets.
        const decoded = await (0, auth_1.getAuth)().verifyIdToken(token, true);
        req.caller = {
            uid: decoded.uid,
            claims: decoded,
        };
        next();
    }
    catch (err) {
        const message = err instanceof Error && err.message ? err.message : "invalid_token";
        res.status(401).json({ error: "invalid_token", detail: message });
    }
}
/**
 * Gate a route to admins only. Must be chained AFTER `requireAuth`.
 * Sends 403 if the caller's `role` claim is not `"admin"`.
 */
function requireAdmin(req, res, next) {
    if (req.caller?.claims?.role !== "admin") {
        res.status(403).json({ error: "admins_only" });
        return;
    }
    next();
}
/**
 * Gate a route to a specific role. Must be chained AFTER `requireAuth`.
 * Example: `router.post("/", requireAuth, requireRole("driver"), handler)`.
 */
function requireRole(role) {
    return function roleGate(req, res, next) {
        if (req.caller?.claims?.role !== role) {
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
function requireAnyRole(...roles) {
    return function anyRoleGate(req, res, next) {
        const role = req.caller?.claims?.role;
        if (!role || !roles.includes(role)) {
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
function extractToken(req) {
    const header = req.headers.authorization ?? "";
    if (header.startsWith(BEARER_PREFIX)) {
        return header.slice(BEARER_PREFIX.length).trim() || null;
    }
    // NOTE: query-token fallback is read-only and used only by SSE GETs.
    // It is acceptable because TLS encrypts the URL in transit; it must
    // never be used for state-changing requests (POST/PATCH/DELETE).
    const q = req.query?.token;
    if (typeof q === "string" && q.length > 0)
        return q;
    return null;
}
//# sourceMappingURL=auth.js.map