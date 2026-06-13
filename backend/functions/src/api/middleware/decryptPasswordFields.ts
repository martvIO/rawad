// Express middleware that transparently decrypts encrypted password fields.
//
// Mounted ahead of the routers that receive passwords (/auth, /users). For each
// known password field present in `req.body`, if the value is an `enc:v1:`
// envelope it is decrypted IN PLACE, so downstream route handlers keep reading
// `req.body.password` / `req.body.newPassword` exactly as before — no handler
// changes were needed.
//
// Backward-compatible by design: a plaintext value (no envelope prefix) passes
// through untouched, so an un-updated client still works. Set
// REQUIRE_ENCRYPTED_PASSWORDS=true to reject plaintext once every client
// encrypts (read at call time so it can be toggled without a redeploy/restart).
//
// CAUTION: after this runs, req.body holds DECRYPTED plaintext passwords. Never
// log req.body (or these fields) on the /auth and /users routers — doing so
// would re-expose the exact plaintext this layer exists to keep out of logs.

import { Request, Response, NextFunction } from "express";
import { decryptField, isEncryptedField } from "../passwordCrypto";

// Body fields that carry a password. MUST stay set-equal to PRESERVE_KEYS in the
// frontend's utils/digits.js (= PASSWORD_FIELDS the client encrypts). Drift is
// guarded by a test (decryptPasswordFields.test.ts). Exported so that test can
// assert equality against the canonical list.
export const PASSWORD_FIELDS = [
  "password",
  "newPassword",
  "currentPassword",
  "oldPassword",
  "confirmPassword",
] as const;

export function decryptPasswordFields(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    next();
    return;
  }

  const requireEncrypted = process.env.REQUIRE_ENCRYPTED_PASSWORDS === "true";

  for (const field of PASSWORD_FIELDS) {
    const val = body[field];
    if (val === undefined || val === null) continue;

    if (isEncryptedField(val)) {
      try {
        body[field] = decryptField(val);
      } catch {
        res.status(400).json({ error: "bad_encrypted_field", field });
        return;
      }
    } else if (typeof val === "string" && requireEncrypted) {
      res.status(400).json({ error: "encryption_required", field });
      return;
    }
  }

  next();
}
