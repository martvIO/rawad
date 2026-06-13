// Authentication routes for the Express REST API.
//
// The frontend has no Firebase Auth SDK; this router is how it obtains a
// Firebase ID token. All six endpoints proxy to the Firebase Auth REST API
// using `WEB_API_KEY` (a SERVER-ONLY env var — never expose in the
// `VITE_*` namespace).
//
//   POST  /auth/login        — username/password → { idToken, refreshToken, ... }
//   POST  /auth/logout       — best-effort acknowledgment (frontend clears tokens)
//   POST  /auth/refresh      — refreshToken → fresh idToken
//   GET   /auth/me           — protected; returns profile + claims of the caller
//   POST  /auth/send-otp     — phone OTP via reCAPTCHA; returns sessionInfo
//   POST  /auth/verify-otp   — sessionInfo + code → phone-auth idToken
//
// What this file does NOT do:
//   - It does not write any portal-user data. User CRUD lives in routes/users.ts.
//   - It does not implement password reset itself — `POST /auth/reset-password`
//     in routes/digital.ts (or its own home; placeholder) handles that flow
//     after a phone-auth ID token has been minted here.

import { Router, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { isStrongPassword, phoneIndexKey, syntheticEmail } from "../../helpers";
import { writeAudit } from "../../audit";
import { AuthRequest, requireAuth } from "../middleware/auth";
import { ipRateLimit } from "../middleware/rateLimit";
import { allow, failureCount, recordFailure, clearFailures } from "../../rateLimit";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { getPublicKeyMeta, isEphemeralKey } from "../passwordCrypto";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Firebase Auth REST API base URLs.
 *
 * When FIREBASE_AUTH_EMULATOR_HOST is set (emulator suite), redirect both
 * endpoints to the local Auth emulator so usernames seeded against the
 * emulator authenticate locally instead of being sent to live Google.
 * Without this, e2e tests against the emulator silently fail with
 * `invalid_credentials`.
 */
function identityToolkitBase(): string {
  const emu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return emu
    ? `http://${emu}/identitytoolkit.googleapis.com/v1/accounts`
    : "https://identitytoolkit.googleapis.com/v1/accounts";
}
function secureTokenBase(): string {
  const emu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return emu
    ? `http://${emu}/securetoken.googleapis.com/v1/token`
    : "https://securetoken.googleapis.com/v1/token";
}
const IDENTITY_TOOLKIT_BASE = identityToolkitBase();
const SECURE_TOKEN_BASE = secureTokenBase();
/** Emulator accepts any non-empty API key; fall back to a dummy value. */
function effectiveApiKey(): string | null {
  const k = process.env.WEB_API_KEY;
  if (k) return k;
  return process.env.FIREBASE_AUTH_EMULATOR_HOST ? "emulator-fake-api-key" : null;
}

/** Rate-limit windows. */
const ONE_HOUR_MS = HOUR_MS;
/** True under the Firebase emulator suite (e2e tests) — disables the lockout. */
const IN_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
// 10/hour/IP was too aggressive — a user fumbling their password, or several
// users behind one NAT/carrier IP, got locked out and (worse) saw a generic
// "wrong password" message. 50/hour still blocks real brute-force given the
// non-enumerable synthetic emails + required strong passwords.
const LOGIN_RATE_PER_HOUR = 50;
// Failure-only per-account lockout. The per-IP limiter above does NOT stop a
// distributed attack that targets ONE account from many IPs. Block once this many
// failed attempts accumulate for an account within ONE_HOUR_MS; only failures
// count (cleared on success) so legitimate repeated logins are never locked out.
const LOGIN_MAX_FAILURES_PER_ACCOUNT = 10;
const REFRESH_RATE_PER_HOUR = 60;
const OTP_RATE_PER_HOUR = 5;
const VERIFY_OTP_RATE_PER_HOUR = 5;
const RESET_PASSWORD_MAX_PER_HOUR_PER_PHONE = RATE.RESET_PER_PHONE.limit;

/**
 * Mapping of Firebase Auth REST API error codes to our app-level codes.
 * The REST endpoint returns codes like `INVALID_PASSWORD`, `EMAIL_NOT_FOUND`,
 * or the newer unified `INVALID_LOGIN_CREDENTIALS` (when "email enumeration
 * protection" is enabled). All three mean the same thing to the user: wrong
 * username or wrong password.
 */
const LOGIN_INVALID_CREDENTIAL_CODES = new Set([
  "INVALID_PASSWORD",
  "EMAIL_NOT_FOUND",
  "INVALID_LOGIN_CREDENTIALS",
  // USER_DISABLED is included deliberately: returning it distinctly would let a
  // caller tell "account exists but disabled" apart from "no such account",
  // re-enabling username enumeration. Collapse it into the same response.
  "USER_DISABLED",
]);

export const authRouter = Router();

// ─── GET /auth/pubkey ─────────────────────────────────────────────────────────

/**
 * Publish the RSA public key clients use to encrypt password fields before
 * sending them (see api/passwordCrypto.ts + middleware/decryptPasswordFields).
 *
 * Public + unauthenticated — the key is non-secret. Returns
 * `{ alg, kid, key }` where `key` is the SPKI DER as base64, or 503
 * `encryption_unavailable` when no key is configured (clients then fall back to
 * sending plaintext over TLS, which the backward-compatible middleware accepts).
 */
authRouter.get("/pubkey", (_req, res) => {
  const meta = getPublicKeyMeta();
  if (!meta) {
    res.status(503).json({ error: "encryption_unavailable" });
    return;
  }
  // A configured key is stable per deploy → let browsers/proxies cache it briefly
  // so a login doesn't pay an extra uncached round-trip. An EPHEMERAL dev key
  // rotates on every cold start, so it must NOT be cached — otherwise a client
  // would keep encrypting to a dead key and its stale-key retry could never
  // recover within the cache window.
  res.set("Cache-Control", isEphemeralKey() ? "no-store" : "public, max-age=300");
  res.json(meta);
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

/**
 * Exchange a username + password for a Firebase ID token.
 *
 * Body:    `{ username: string, password: string }`
 * Returns: `{ idToken, refreshToken, expiresIn, uid, role, username }`
 *
 * Errors:  401 `invalid_credentials` on bad username/password.
 *          400 with Firebase's raw error code on other failures.
 *          500 `server_misconfigured` if WEB_API_KEY is unset.
 */
authRouter.post(
  "/login",
  ipRateLimit("login", LOGIN_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    const acct = username.trim().toLowerCase();
    const acctKey = `login_acct:${acct}`;
    // Per-account lockout (see LOGIN_MAX_FAILURES_PER_ACCOUNT). Skipped under the
    // emulator so e2e suites can hammer login without tripping it.
    if (!IN_EMULATOR && failureCount(acctKey) >= LOGIN_MAX_FAILURES_PER_ACCOUNT) {
      res.status(429).json({ error: "too_many_requests", scope: "account" });
      return;
    }

    const apiKey = effectiveApiKey();
    if (!apiKey) {
      res.status(500).json({ error: "server_misconfigured" });
      return;
    }

    const email = syntheticEmail(acct);
    const fbRes = await fetch(
      `${IDENTITY_TOOLKIT_BASE}:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    const fbData = (await fbRes.json()) as Record<string, unknown>;

    if (!fbRes.ok) {
      const code = extractFirebaseErrorCode(fbData);
      if (LOGIN_INVALID_CREDENTIAL_CODES.has(code)) {
        if (!IN_EMULATOR) recordFailure(acctKey, ONE_HOUR_MS);
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }
      // Don't echo the raw Firebase code to the client — codes such as
      // TOO_MANY_ATTEMPTS_TRY_LATER expose internal state. Log it server-side
      // and return a generic failure. (USER_DISABLED is handled above.)
      // eslint-disable-next-line no-console
      console.warn("[auth] login failed (non-credential)", { code });
      res.status(400).json({ error: "login_failed" });
      return;
    }

    const uid = String(fbData.localId ?? "");
    // Successful credential check — reset this account's failure counter.
    if (!IN_EMULATOR) clearFailures(acctKey);
    // Enrich the response with the RTDB profile so the client can render
    // the role-appropriate portal without a second round-trip.
    const profile = await loadUserProfile(uid);

    res.json({
      idToken: fbData.idToken,
      refreshToken: fbData.refreshToken,
      expiresIn: fbData.expiresIn,
      uid,
      role: profile?.role ?? null,
      username: profile?.username ?? null,
      displayName: profile?.displayName ?? null,
      phoneE164: profile?.phoneE164 ?? null,
    });
  }
);

// ─── POST /auth/logout ────────────────────────────────────────────────────────

/**
 * Logout. The frontend discards its tokens locally; this endpoint also revokes
 * the user's refresh tokens server-side so a captured refresh token cannot keep
 * minting fresh ID tokens after sign-out. `requireAuth` verifies every token
 * with `checkRevoked: true`, so outstanding sessions are rejected on their next
 * call. Revocation is best-effort — a failure never blocks the client sign-out.
 *
 * Returns: `{ ok: true }`
 */
authRouter.post("/logout", requireAuth, async (req: AuthRequest, res: Response) => {
  const uid = req.caller!.uid;
  try {
    await getAuth().revokeRefreshTokens(uid);
    await writeAudit(uid, "logout", {});
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[auth] logout token revoke failed", err);
  }
  res.json({ ok: true });
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

/**
 * Exchange a refresh token for a fresh ID token.
 *
 * Body:    `{ refreshToken: string }`
 * Returns: `{ idToken, refreshToken, expiresIn }` (note: snake_case in the
 *          underlying Firebase response is normalized to camelCase here).
 * Errors:  401 `refresh_failed` if the token is revoked, expired, or invalid.
 */
authRouter.post(
  "/refresh",
  ipRateLimit("refresh", REFRESH_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== "string" || refreshToken.length === 0) {
      res.status(400).json({ error: "missing_refresh_token" });
      return;
    }

    const apiKey = effectiveApiKey();
    if (!apiKey) {
      res.status(500).json({ error: "server_misconfigured" });
      return;
    }

    const fbRes = await fetch(`${SECURE_TOKEN_BASE}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    const fbData = (await fbRes.json()) as Record<string, unknown>;

    if (!fbRes.ok) {
      res.status(401).json({ error: "refresh_failed" });
      return;
    }

    res.json({
      idToken: fbData.id_token,
      refreshToken: fbData.refresh_token,
      expiresIn: fbData.expires_in,
    });
  }
);

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

/**
 * Return the authenticated caller's profile + custom claims. Used by the
 * frontend's `subscribeAuth` poller to detect role/assignment changes
 * (replaces Firebase Auth SDK's `onIdTokenChanged`).
 *
 * Returns: `{ uid, role, username, displayName, phoneE164, claims }`
 */
authRouter.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const uid = req.caller!.uid;
  const claims = req.caller!.claims;
  const profile = await loadUserProfile(uid);
  res.json({
    uid,
    role: claims.role ?? profile?.role ?? null,
    username: claims.username ?? profile?.username ?? null,
    displayName: profile?.displayName ?? null,
    phoneE164: profile?.phoneE164 ?? null,
    claims,
  });
});

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────

/**
 * Send an SMS verification code for the password-reset flow.
 *
 * Body:    `{ phoneE164: string, recaptchaToken: string }`
 * Returns: `{ sessionInfo: string }` (an opaque token from Firebase to be
 *           paired with the user-entered code on /auth/verify-otp).
 *
 * The `recaptchaToken` must come from a reCAPTCHA v2 widget rendered in
 * the frontend. This is a Firebase requirement we cannot bypass; see
 * PasswordResetFlow.jsx for how the frontend obtains the token.
 */
authRouter.post(
  "/send-otp",
  ipRateLimit("otp", OTP_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req, res) => {
    const { phoneE164, recaptchaToken } = req.body ?? {};
    if (typeof phoneE164 !== "string" || typeof recaptchaToken !== "string") {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    const apiKey = effectiveApiKey();
    if (!apiKey) {
      res.status(500).json({ error: "server_misconfigured" });
      return;
    }

    const fbRes = await fetch(
      `${IDENTITY_TOOLKIT_BASE}:sendVerificationCode?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneE164, recaptchaToken }),
      }
    );
    const fbData = (await fbRes.json()) as Record<string, unknown>;

    if (!fbRes.ok) {
      // Log the precise code server-side; return a generic one so phone-state
      // probing (valid vs invalid number, quota) can't read internal codes.
      const code = extractFirebaseErrorCode(fbData);
      // eslint-disable-next-line no-console
      console.warn("[auth] send-otp failed", { code });
      res.status(400).json({ error: "otp_failed" });
      return;
    }

    res.json({ sessionInfo: fbData.sessionInfo });
  }
);

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────

/**
 * Verify the user-entered SMS code and sign the caller in as the phone-auth
 * user. The returned ID token's `phone_number` claim is what gates
 * `resetPassword` in `digital.ts` (or wherever it ends up).
 *
 * Body:    `{ sessionInfo: string, code: string }`
 * Returns: `{ idToken, refreshToken, expiresIn }`
 */
authRouter.post(
  "/verify-otp",
  ipRateLimit("verifyOtp", VERIFY_OTP_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req, res) => {
    const { sessionInfo, code } = req.body ?? {};
    if (typeof sessionInfo !== "string" || typeof code !== "string") {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    const apiKey = effectiveApiKey();
    if (!apiKey) {
      res.status(500).json({ error: "server_misconfigured" });
      return;
    }

    const fbRes = await fetch(
      `${IDENTITY_TOOLKIT_BASE}:signInWithPhoneNumber?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionInfo, code }),
      }
    );
    const fbData = (await fbRes.json()) as Record<string, unknown>;

    if (!fbRes.ok) {
      // Log the precise code server-side; return a generic one to the client.
      const errCode = extractFirebaseErrorCode(fbData);
      // eslint-disable-next-line no-console
      console.warn("[auth] verify-otp failed", { code: errCode });
      res.status(400).json({ error: "verify_failed" });
      return;
    }

    res.json({
      idToken: fbData.idToken,
      refreshToken: fbData.refreshToken,
      expiresIn: fbData.expiresIn,
    });
  }
);

// ─── POST /auth/reset-password ────────────────────────────────────────────────

/**
 * Reset a portal user's password after phone-OTP verification.
 *
 * Flow:
 *   1. Client signs in via POST /auth/verify-otp — gets a phone-auth idToken.
 *   2. Client passes that idToken in `Authorization: Bearer ...` here.
 *   3. We verify the token AND that it carries a `phone_number` claim
 *      (only present on phone-auth sessions, never on portal logins).
 *   4. Look up the portal user that owns that phone in /phoneIndex.
 *   5. Update their password + revoke refresh tokens.
 *   6. Delete the throw-away phone-auth user so the phone isn't tied to two.
 *
 * Body:    `{ newPassword: string }`
 * Returns: `{ ok: true }`.
 */
authRouter.post(
  "/reset-password",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const phoneAuthUid = req.caller!.uid;
    const claims = req.caller!.claims as Record<string, unknown>;
    const phoneE164 =
      typeof claims.phone_number === "string" ? claims.phone_number : "";
    if (!phoneE164) {
      res.status(403).json({ error: "phone_verified_session_required" });
      return;
    }

    const newPassword = (req.body?.newPassword ?? "").toString();
    if (!isStrongPassword(newPassword)) {
      res.status(400).json({ error: "weak_password" });
      return;
    }
    if (
      !allow(
        `reset:${phoneE164}`,
        RESET_PASSWORD_MAX_PER_HOUR_PER_PHONE,
        ONE_HOUR_MS
      )
    ) {
      res.status(429).json({ error: "too_many_requests", scope: "phone" });
      return;
    }

    try {
      const db = getDatabase();
      const targetUidSnap = await db
        .ref(`phoneIndex/${phoneIndexKey(phoneE164)}`)
        .get();
      if (!targetUidSnap.exists()) {
        res.status(404).json({ error: "no_account_for_phone" });
        return;
      }
      const targetUid = targetUidSnap.val() as string;

      const profile = (await db.ref(`users/${targetUid}`).get()).val() as
        | { phoneE164?: string }
        | null;
      if (!profile || profile.phoneE164 !== phoneE164) {
        res.status(403).json({ error: "phone_does_not_match_account" });
        return;
      }

      const auth = getAuth();
      await auth.updateUser(targetUid, { password: newPassword });
      await auth.revokeRefreshTokens(targetUid);
      // Best-effort cleanup of the throw-away phone-auth user. Failure here
      // does not block the password reset — the reset already succeeded.
      try {
        await auth.deleteUser(phoneAuthUid);
      } catch {
        // noop
      }
      await writeAudit(targetUid, "resetPassword", { via: "phone" });

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "reset_failed", detail: errorMessage(err) });
    }
  }
);

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Shape of the `/users/{uid}` RTDB record. Kept minimal — only the fields
 * `/auth/me` and `/auth/login` need.
 */
interface UserProfile {
  username?: string;
  role?: "admin" | "driver" | "groom";
  displayName?: string;
  phoneE164?: string;
}

/**
 * Read a portal-user profile from RTDB. Returns `null` if the node doesn't
 * exist. Catches and discards read errors so login/me never 500 on a transient
 * RTDB failure — the client still gets the ID token even if profile fetch fails.
 */
async function loadUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  try {
    const snap = await getDatabase().ref(`users/${uid}`).get();
    if (!snap.exists()) return null;
    const val = snap.val();
    return (typeof val === "object" && val !== null ? val : null) as UserProfile | null;
  } catch {
    // NOTE: deliberately swallow — token issuance must not depend on RTDB read.
    return null;
  }
}

/**
 * Pull the `error.message` field out of a Firebase Auth REST error response.
 * Firebase wraps everything in `{ error: { code, message, errors[] } }` where
 * the `message` is the stable, machine-readable code (e.g. `INVALID_PASSWORD`).
 * Returns the empty string when the shape isn't what we expect.
 */
function extractFirebaseErrorCode(fbData: Record<string, unknown>): string {
  const errObj = fbData?.error;
  if (errObj && typeof errObj === "object" && "message" in errObj) {
    const msg = (errObj as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

/**
 * Best-effort error-to-string conversion for JSON error responses.
 */
function errorMessage(err: unknown): string | undefined {
  // Public/admin 5xx responses must not echo raw error text in production — it
  // can leak Firestore paths / GCS bucket names. Suppressed by default; set
  // DAWA_DEBUG_ERRORS=1 (e.g. functions/.env.local) to see detail locally.
  if (process.env.DAWA_DEBUG_ERRORS !== "1") return undefined;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
