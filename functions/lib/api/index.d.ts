import { Request, Response, NextFunction } from "express";
export declare const app: import("express-serve-static-core").Express;
/**
 * Strip a leading "/api" segment from req.url so resource routers can be
 * mounted at "/auth", "/users", etc. regardless of whether the request
 * arrived via Firebase Hosting rewrite (preserves "/api/...") or via a
 * direct Cloud Functions URL (strips the function name, so "/auth/...").
 *
 * Exported so the behavior is unit-testable without booting the full app.
 */
export declare function stripApiPrefix(req: Request, _res: Response, next: NextFunction): void;
