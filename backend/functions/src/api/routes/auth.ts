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
import { ipRateLimit, ipRateLimitPersistent, uidRateLimit } from "../middleware/rateLimit";
// Security-critical auth limiters (login/OTP/reset/lockout) are PERSISTENT
// (cross-instance) so a cold start can't reset brute-force protection.
import {
  allowPersistent,
  failureCountPersistent,
  recordFailurePersistent,
  clearFailuresPersistent,
} from "../../rateLimitPersistent";
import { rtdbPort } from "../../domain/firebaseAdapters";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { getPublicKeyMeta, isEphemeralKey } from "../passwordCrypto";
import { recordSecurityEvent } from "../../securityEvents";
import { recordAutoBlockSignal } from "../../autoBlock";

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
// Defensive upper bounds on raw auth input — reject absurd payloads before any
// work (large-body / ReDoS hygiene). Real usernames are ≤60 chars (isUsername)
// and a portal password never needs to be huge; these are generous ceilings, not
// the real policy (which Firebase Auth + isStrongPassword still enforce).
const MAX_USERNAME_INPUT_LEN = 256;
const MAX_PASSWORD_INPUT_LEN = 1024;
const MAX_PHONE_INPUT_LEN = 64;
const MAX_RECAPTCHA_TOKEN_LEN = 4096;
const REFRESH_RATE_PER_HOUR = 60;
const OTP_RATE_PER_HOUR = 5;
const VERIFY_OTP_RATE_PER_HOUR = 5;
const RESET_PASSWORD_MAX_PER_HOUR_PER_PHONE = RATE.RESET_PER_PHONE.limit;
const CHANGE_PASSWORD_MAX_PER_HOUR_PER_USER = RATE.CHANGE_PASSWORD_PER_USER.limit;

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
  ipRateLimitPersistent("login", LOGIN_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req, res) => {
    const { username, password } = req.body ?? {};
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length > MAX_USERNAME_INPUT_LEN ||
      password.length > MAX_PASSWORD_INPUT_LEN
    ) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    const acct = username.trim().toLowerCase();
    const acctKey = `login_acct:${acct}`;
    // The per-account failure count is a SIGNAL — NOT a pre-credential hard block.
    // A hard block let an unauthenticated attacker lock out a real user (incl.
    // admin) with ~10 wrong-password POSTs from one IP: a cheap targeted
    // account-lockout DoS, and precisely the account-block that autoBlock.ts
    // deliberately refuses to do. Instead we ALWAYS verify the password: a correct
    // one logs in and clears the counter (so a legitimate user can never be locked
    // out by someone else's failures), and only a FAILED attempt against an
    // already-maxed account is answered with 429. Brute force stays bounded by the
    // per-IP limiter (50/hr) + the auth_failure IP auto-block. Skipped in the
    // emulator so e2e suites can hammer login.
    const lockedOut =
      !IN_EMULATOR &&
      (await failureCountPersistent(rtdbPort(), acctKey)) >= LOGIN_MAX_FAILURES_PER_ACCOUNT;

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
        if (!IN_EMULATOR) await recordFailurePersistent(rtdbPort(), acctKey, ONE_HOUR_MS);
        recordSecurityEvent(lockedOut ? "account_lockout" : "auth_failure", req, {
          detail: { account: acct },
        });
        recordAutoBlockSignal("auth_failure", req);
        // A failed attempt against an already-maxed account → 429 (throttle the
        // attacker). A correct password never reaches this branch, so the real
        // user is never locked out by another party's failures.
        if (lockedOut) {
          res.status(429).json({ error: "too_many_requests", scope: "account" });
        } else {
          res.status(401).json({ error: "invalid_credentials" });
        }
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
    if (!IN_EMULATOR) await clearFailuresPersistent(rtdbPort(), acctKey);
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
      canSeeAttendance: profile?.canSeeAttendance !== false,
      canUsePhotographer: profile?.canUsePhotographer !== false,
      canUseBoardingPass: profile?.canUseBoardingPass === true,
      // Drives the forced first-login password-change gate (Portal.jsx). Included
      // on login so the gate triggers without waiting for the first /auth/me poll.
      mustChangePassword: profile?.mustChangePassword === true,
      // First-sign-in onboarding gate (couple bride/groom names). onboardedAt unset
      // → the groom sees the onboarding screen before the portal.
      onboardedAt: profile?.onboardedAt ?? null,
      brideName: profile?.brideName ?? null,
      groomName: profile?.groomName ?? null,
      weddingDate: profile?.weddingDate ?? null,
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
    canSeeAttendance: profile?.canSeeAttendance !== false,
    canUsePhotographer: profile?.canUsePhotographer !== false,
    canUseBoardingPass: profile?.canUseBoardingPass === true,
    mustChangePassword: profile?.mustChangePassword === true,
    onboardedAt: profile?.onboardedAt ?? null,
    brideName: profile?.brideName ?? null,
    groomName: profile?.groomName ?? null,
    weddingDate: profile?.weddingDate ?? null,
    claims,
  });
});

// ─── POST /auth/onboarding ────────────────────────────────────────────────────

/**
 * First-sign-in onboarding for a groom (the couple): capture the bride & groom
 * names (and optional wedding date) into the account record so the digital-
 * invitation editor can pre-seed the first design. Self-service — the groom writes
 * their own profile via the Admin SDK (client writes to /users are admin-only).
 * Setting `onboardedAt` clears the onboarding gate (Portal.jsx / app index.jsx).
 *
 * Body:    `{ brideName: string, groomName: string, weddingDate?: number }`
 * Returns: `{ ok: true, onboardedAt }`
 */
authRouter.post("/onboarding", requireAuth, async (req: AuthRequest, res: Response) => {
  const uid = req.caller!.uid;
  if (req.caller!.claims.role !== "groom") {
    res.status(403).json({ error: "groom_only" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  const brideName = clean(body.brideName);
  const groomName = clean(body.groomName);
  if (!brideName || !groomName) {
    res.status(400).json({ error: "names_required" });
    return;
  }
  const weddingDate =
    typeof body.weddingDate === "number" && Number.isFinite(body.weddingDate) ? body.weddingDate : null;
  const onboardedAt = Date.now();
  try {
    const patch: Record<string, unknown> = {
      [`users/${uid}/brideName`]: brideName,
      [`users/${uid}/groomName`]: groomName,
      [`users/${uid}/onboardedAt`]: onboardedAt,
    };
    if (weddingDate != null) patch[`users/${uid}/weddingDate`] = weddingDate;
    await getDatabase().ref().update(patch);
    await writeAudit(uid, "onboarding", { via: "self" });
    res.json({ ok: true, onboardedAt });
  } catch (err) {
    res.status(500).json({ error: "onboarding_failed", detail: errorMessage(err) });
  }
});

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────

/**
 * Send an SMS verification code for the password-reset flow.
 *
 * Body:    `{ username: string, phoneE164: string, recaptchaToken: string }`
 *           The username+phone pair must match an existing account or we
 *           reject with a generic `account_phone_mismatch` before any SMS.
 * Returns: `{ sessionInfo: string }` (an opaque token from Firebase to be
 *           paired with the user-entered code on /auth/verify-otp).
 *
 * The `recaptchaToken` must come from a reCAPTCHA v2 widget rendered in
 * the frontend. This is a Firebase requirement we cannot bypass; see
 * PasswordResetFlow.jsx for how the frontend obtains the token.
 */
authRouter.post(
  "/send-otp",
  ipRateLimitPersistent("otp", OTP_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req, res) => {
    const { username, phoneE164, recaptchaToken } = req.body ?? {};
    if (
      typeof username !== "string" ||
      typeof phoneE164 !== "string" ||
      typeof recaptchaToken !== "string" ||
      username.length > MAX_USERNAME_INPUT_LEN ||
      phoneE164.length > MAX_PHONE_INPUT_LEN ||
      recaptchaToken.length > MAX_RECAPTCHA_TOKEN_LEN
    ) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    const acct = username.trim().toLowerCase();
    // Per-username throttle on TOP of the per-IP limiter. The per-IP limit alone
    // doesn't stop a distributed attacker who, knowing one username, brute-forces
    // its phone across rotating IPs (each match returns a distinguishable 200, so
    // send-otp is a phone-discovery oracle for a known username). Capping attempts
    // per username — regardless of source IP — closes that. (allowPersistent
    // sanitises the key, so an odd username can't corrupt the RTDB path.)
    if (
      acct &&
      !(await allowPersistent(
        rtdbPort(),
        `otp_acct:${acct}`,
        OTP_RATE_PER_HOUR,
        ONE_HOUR_MS
      ))
    ) {
      recordSecurityEvent("otp_abuse", req, { detail: { account: acct, scope: "account" } });
      res.status(429).json({ error: "too_many_requests", scope: "account" });
      return;
    }

    // Username + phone must match an existing account before we spend an SMS.
    // This blocks SMS-bombing arbitrary numbers AND makes the reset deliberate
    // (a phone-less account can never match a real number, so those users are
    // steered to the admin instead). We return ONE generic error for both
    // "no such username" and "phone doesn't match" so this endpoint can't be
    // used as a username-enumeration / phone-probing oracle. Lookups are
    // wrapped so an illegal-key username can't 500 (RTDB keys reject .#$[]/).
    let ownerUid: string | null = null;
    try {
      const db = getDatabase();
      for (const key of [acct, username.trim()]) {
        if (!key) continue;
        const snap = await db.ref(`usernameIndex/${key}`).get();
        if (snap.exists()) {
          ownerUid = snap.val() as string;
          break;
        }
      }
      if (ownerUid) {
        const storedPhone = (
          await db.ref(`users/${ownerUid}/phoneE164`).get()
        ).val();
        if (storedPhone !== phoneE164) ownerUid = null;
      }
    } catch {
      ownerUid = null;
    }
    if (!ownerUid) {
      res.status(400).json({ error: "account_phone_mismatch" });
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
  ipRateLimitPersistent("verifyOtp", VERIFY_OTP_RATE_PER_HOUR, ONE_HOUR_MS),
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
      !(await allowPersistent(
        rtdbPort(),
        `reset:${phoneE164}`,
        RESET_PASSWORD_MAX_PER_HOUR_PER_PHONE,
        ONE_HOUR_MS
      ))
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
      // The user just chose their own password, so a pending forced first-login
      // change is satisfied: clear the flag and purge the stored temp password
      // (mirrors POST /auth/change-password).
      await db.ref().update({
        [`users/${targetUid}/mustChangePassword`]: null,
        [`generatedPasswords/${targetUid}`]: null,
      });
      // Best-effort cleanup of the throw-away phone-auth user — but ONLY when it
      // is genuinely a separate identity. Portal users created WITH a phone carry
      // that number as their Firebase Auth `phoneNumber` (see userStore/
      // createGroomAccount), so `signInWithPhoneNumber` signs into the portal
      // user itself and `phoneAuthUid === targetUid`. Deleting it here would wipe
      // the very account we just reset. Only delete when the phone-auth session
      // is a distinct throw-away user. Failure never blocks the (already-done) reset.
      if (phoneAuthUid !== targetUid) {
        try {
          await auth.deleteUser(phoneAuthUid);
        } catch {
          // noop
        }
      }
      await writeAudit(targetUid, "resetPassword", { via: "phone" });

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "reset_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /auth/change-password ───────────────────────────────────────────────

/**
 * Self-service password change for the signed-in user. Used by the forced
 * first-login change (post-payment signup) AND any user changing their own
 * password. Verifies the current password (so a stolen, still-valid ID token
 * can't silently rotate the password), then updates it and clears the
 * mustChangePassword flag + the admin-visible generated password.
 *
 * Body:    `{ currentPassword, newPassword }` (both decrypted by
 *           decryptPasswordFields ahead of this router).
 * Returns: `{ ok: true }`. The caller's refresh tokens are revoked, so the
 *           frontend must re-login afterward.
 */
authRouter.post(
  "/change-password",
  requireAuth,
  uidRateLimit("changePassword", CHANGE_PASSWORD_MAX_PER_HOUR_PER_USER, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const uid = req.caller!.uid;
    const claims = req.caller!.claims as Record<string, unknown>;
    const currentPassword = (req.body?.currentPassword ?? "").toString();
    const newPassword = (req.body?.newPassword ?? "").toString();

    if (!isStrongPassword(newPassword)) {
      res.status(400).json({ error: "weak_password" });
      return;
    }
    if (newPassword === currentPassword) {
      res.status(400).json({ error: "password_unchanged" });
      return;
    }

    const apiKey = effectiveApiKey();
    if (!apiKey) {
      res.status(500).json({ error: "server_misconfigured" });
      return;
    }

    // Resolve the username to rebuild the synthetic email for the credential
    // check (claims first, RTDB profile as fallback).
    let username = typeof claims.username === "string" ? (claims.username as string) : "";
    if (!username) {
      const profile = await loadUserProfile(uid);
      username = profile?.username ?? "";
    }
    if (!username) {
      res.status(400).json({ error: "no_username" });
      return;
    }

    // Verify the CURRENT password against Firebase Auth.
    const verifyRes = await fetch(
      `${IDENTITY_TOOLKIT_BASE}:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: syntheticEmail(username),
          password: currentPassword,
          returnSecureToken: false,
        }),
      }
    );
    if (!verifyRes.ok) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    try {
      const auth = getAuth();
      await auth.updateUser(uid, { password: newPassword });
      // Clear the forced-change flag AND purge the admin-visible generated
      // password (its only purpose was first-login delivery fallback).
      await getDatabase().ref().update({
        [`users/${uid}/mustChangePassword`]: null,
        [`generatedPasswords/${uid}`]: null,
      });
      await auth.revokeRefreshTokens(uid);
      await writeAudit(uid, "changePassword", { via: "self" });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "change_failed", detail: errorMessage(err) });
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
  canSeeAttendance?: boolean;
  canUsePhotographer?: boolean;
  canUseBoardingPass?: boolean;
  mustChangePassword?: boolean;
  // First-sign-in onboarding (POST /auth/onboarding).
  brideName?: string;
  groomName?: string;
  weddingDate?: number;
  onboardedAt?: number;
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

// errorMessage (suppress-by-default 5xx detail) is now shared — see ../errorDetail.
import { errorMessage } from "../errorDetail";
