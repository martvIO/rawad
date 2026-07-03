// Block-enforcement middleware. Mounted globally, BEFORE the routers and
// requireAuth, so a blocked IP or device fingerprint is refused on every route
// (including public/unauthenticated forms) before any handler runs.
//
// Account blocks are NOT enforced here — they are enforced authoritatively by
// Firebase Auth (the security route disables the user + revokes tokens, so
// requireAuth's verifyIdToken rejects them). See blockList.ts for the rationale.
//
// FAIL-OPEN — a block-store error must never lock out every user. On any error
// the request is allowed through (and the error is logged).

import { Request, Response, NextFunction } from "express";
import { checkIpOrFingerprintBlocked } from "../../blockList";
import { recordSecurityEvent } from "../../securityEvents";

export async function blockCheck(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let hit = null;
  try {
    hit = await checkIpOrFingerprintBlocked(req);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[blockCheck] failed-open", err);
    next();
    return;
  }
  if (hit) {
    recordSecurityEvent("blocked_request", req, { detail: { kind: hit.kind } });
    res.status(403).json({ error: "blocked" });
    return;
  }
  next();
}
