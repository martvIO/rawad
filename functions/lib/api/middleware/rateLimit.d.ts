import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
export declare function ipRateLimit(prefix: string, maxPerHour: number, windowMs: number): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Throttle by authenticated caller UID. Must be chained AFTER `requireAuth`
 * (which sets `req.caller.uid`).
 */
export declare function uidRateLimit(prefix: string, maxPerHour: number, windowMs: number): (req: AuthRequest, res: Response, next: NextFunction) => void;
