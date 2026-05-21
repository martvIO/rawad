// Authentication routes for the Express REST API.
//
// The frontend has no Firebase Auth SDK; this router is how it obtains a
// Firebase ID token. All six endpoints proxy to the Firebase Auth REST API
// using `FIREBASE_API_KEY` (a SERVER-ONLY env var — never expose in the
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
import { allow } from "../../rateLimit";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Firebase Auth REST API base URLs. */
const IDENTITY_TOOLKIT_BASE = "https://identitytoolkit.googleapis.com/v1/accounts";
const SECURE_TOKEN_BASE = "https://securetoken.googleapis.com/v1/token";

/** Rate-limit windows. */
const ONE_HOUR_MS = 60 * 60 * 1000;
const LOGIN_RATE_PER_HOUR = 10;
const REFRESH_RATE_PER_HOUR = 60;
const OTP_RATE_PER_HOUR = 5;
const VERIFY_OTP_RATE_PER_HOUR = 5;
const RESET_PASSWORD_MAX_PER_HOUR_PER_PHONE = 5;

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
]);

export const authRouter = Router();

// ─── POST /auth/login ─────────────────────────────────────────────────────────

/**
 * Exchange a username + password for a Firebase ID token.
 *
 * Body:    `{ username: string, password: string }`
 * Returns: `{ idToken, refreshToken, expiresIn, uid, role, username }`
 *
 * Errors:  401 `invalid_credentials` on bad username/password.
 *          400 with Firebase's raw error code on other failures.
 *          500 `server_misconfigured` if FIREBASE_API_KEY is unset.
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

    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "server_misconfigured" });
      return;
    }

    const email = syntheticEmail(username.trim().toLowerCase());
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
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }
      res.status(400).json({ error: code });
      return;
    }

    const uid = String(fbData.localId ?? "");
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
 * Stateless logout. The frontend already discards its tokens locally; this
 * endpoint exists so we can later add server-side bookkeeping (e.g. revoke
 * refresh tokens) without changing the client contract.
 *
 * Returns: `{ ok: true }`
 */
authRouter.post("/logout", requireAuth, (_req, res) => {
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

    const apiKey = process.env.FIREBASE_API_KEY;
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

    const apiKey = process.env.FIREBASE_API_KEY;
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
      const code = extractFirebaseErrorCode(fbData);
      res.status(400).json({ error: code || "otp_failed" });
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

    const apiKey = process.env.FIREBASE_API_KEY;
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
      const errCode = extractFirebaseErrorCode(fbData);
      res.status(400).json({ error: errCode || "verify_failed" });
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
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
