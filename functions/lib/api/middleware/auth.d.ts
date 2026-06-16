import { Request, Response, NextFunction } from "express";
import { DawaClaims } from "../../helpers";
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
export declare function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
/**
 * Gate a route to admins only. Must be chained AFTER `requireAuth`.
 * Sends 403 if the caller's `role` claim is not `"admin"`.
 */
export declare function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void;
/**
 * Gate a route to a specific role. Must be chained AFTER `requireAuth`.
 * Example: `router.post("/", requireAuth, requireRole("driver"), handler)`.
 */
export declare function requireRole(role: Role): (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Gate a route to ANY of the listed roles. Must be chained AFTER
 * `requireAuth`. Convenient when an endpoint serves multiple roles
 * (e.g. groom AND admin can both create invites).
 */
export declare function requireAnyRole(...roles: Role[]): (req: AuthRequest, res: Response, next: NextFunction) => void;
