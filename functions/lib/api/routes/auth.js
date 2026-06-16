"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const auth_1 = require("firebase-admin/auth");
const database_1 = require("firebase-admin/database");
const helpers_1 = require("../../helpers");
const audit_1 = require("../../audit");
const auth_2 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const rateLimit_2 = require("../../rateLimit");
const time_1 = require("../../constants/time");
const rateLimits_1 = require("../../constants/rateLimits");
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
function identityToolkitBase() {
    const emu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    return emu
        ? `http://${emu}/identitytoolkit.googleapis.com/v1/accounts`
        : "https://identitytoolkit.googleapis.com/v1/accounts";
}
function secureTokenBase() {
    const emu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    return emu
        ? `http://${emu}/securetoken.googleapis.com/v1/token`
        : "https://securetoken.googleapis.com/v1/token";
}
const IDENTITY_TOOLKIT_BASE = identityToolkitBase();
const SECURE_TOKEN_BASE = secureTokenBase();
/** Emulator accepts any non-empty API key; fall back to a dummy value. */
function effectiveApiKey() {
    const k = process.env.WEB_API_KEY;
    if (k)
        return k;
    return process.env.FIREBASE_AUTH_EMULATOR_HOST ? "emulator-fake-api-key" : null;
}
/** Rate-limit windows. */
const ONE_HOUR_MS = time_1.HOUR_MS;
// 10/hour/IP was too aggressive — a user fumbling their password, or several
// users behind one NAT/carrier IP, got locked out and (worse) saw a generic
// "wrong password" message. 50/hour still blocks real brute-force given the
// non-enumerable synthetic emails + required strong passwords.
const LOGIN_RATE_PER_HOUR = 50;
const REFRESH_RATE_PER_HOUR = 60;
const OTP_RATE_PER_HOUR = 5;
const VERIFY_OTP_RATE_PER_HOUR = 5;
const RESET_PASSWORD_MAX_PER_HOUR_PER_PHONE = rateLimits_1.RATE.RESET_PER_PHONE.limit;
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
exports.authRouter = (0, express_1.Router)();
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
exports.authRouter.post("/login", (0, rateLimit_1.ipRateLimit)("login", LOGIN_RATE_PER_HOUR, ONE_HOUR_MS), async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
        res.status(400).json({ error: "missing_fields" });
        return;
    }
    const apiKey = effectiveApiKey();
    if (!apiKey) {
        res.status(500).json({ error: "server_misconfigured" });
        return;
    }
    const email = (0, helpers_1.syntheticEmail)(username.trim().toLowerCase());
    const fbRes = await fetch(`${IDENTITY_TOOLKIT_BASE}:signInWithPassword?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const fbData = (await fbRes.json());
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
});
// ─── POST /auth/logout ────────────────────────────────────────────────────────
/**
 * Stateless logout. The frontend already discards its tokens locally; this
 * endpoint exists so we can later add server-side bookkeeping (e.g. revoke
 * refresh tokens) without changing the client contract.
 *
 * Returns: `{ ok: true }`
 */
exports.authRouter.post("/logout", auth_2.requireAuth, (_req, res) => {
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
exports.authRouter.post("/refresh", (0, rateLimit_1.ipRateLimit)("refresh", REFRESH_RATE_PER_HOUR, ONE_HOUR_MS), async (req, res) => {
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
    const fbData = (await fbRes.json());
    if (!fbRes.ok) {
        res.status(401).json({ error: "refresh_failed" });
        return;
    }
    res.json({
        idToken: fbData.id_token,
        refreshToken: fbData.refresh_token,
        expiresIn: fbData.expires_in,
    });
});
// ─── GET /auth/me ─────────────────────────────────────────────────────────────
/**
 * Return the authenticated caller's profile + custom claims. Used by the
 * frontend's `subscribeAuth` poller to detect role/assignment changes
 * (replaces Firebase Auth SDK's `onIdTokenChanged`).
 *
 * Returns: `{ uid, role, username, displayName, phoneE164, claims }`
 */
exports.authRouter.get("/me", auth_2.requireAuth, async (req, res) => {
    const uid = req.caller.uid;
    const claims = req.caller.claims;
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
exports.authRouter.post("/send-otp", (0, rateLimit_1.ipRateLimit)("otp", OTP_RATE_PER_HOUR, ONE_HOUR_MS), async (req, res) => {
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
    const fbRes = await fetch(`${IDENTITY_TOOLKIT_BASE}:sendVerificationCode?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneE164, recaptchaToken }),
    });
    const fbData = (await fbRes.json());
    if (!fbRes.ok) {
        const code = extractFirebaseErrorCode(fbData);
        res.status(400).json({ error: code || "otp_failed" });
        return;
    }
    res.json({ sessionInfo: fbData.sessionInfo });
});
// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
/**
 * Verify the user-entered SMS code and sign the caller in as the phone-auth
 * user. The returned ID token's `phone_number` claim is what gates
 * `resetPassword` in `digital.ts` (or wherever it ends up).
 *
 * Body:    `{ sessionInfo: string, code: string }`
 * Returns: `{ idToken, refreshToken, expiresIn }`
 */
exports.authRouter.post("/verify-otp", (0, rateLimit_1.ipRateLimit)("verifyOtp", VERIFY_OTP_RATE_PER_HOUR, ONE_HOUR_MS), async (req, res) => {
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
    const fbRes = await fetch(`${IDENTITY_TOOLKIT_BASE}:signInWithPhoneNumber?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionInfo, code }),
    });
    const fbData = (await fbRes.json());
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
});
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
exports.authRouter.post("/reset-password", auth_2.requireAuth, async (req, res) => {
    const phoneAuthUid = req.caller.uid;
    const claims = req.caller.claims;
    const phoneE164 = typeof claims.phone_number === "string" ? claims.phone_number : "";
    if (!phoneE164) {
        res.status(403).json({ error: "phone_verified_session_required" });
        return;
    }
    const newPassword = (req.body?.newPassword ?? "").toString();
    if (!(0, helpers_1.isStrongPassword)(newPassword)) {
        res.status(400).json({ error: "weak_password" });
        return;
    }
    if (!(0, rateLimit_2.allow)(`reset:${phoneE164}`, RESET_PASSWORD_MAX_PER_HOUR_PER_PHONE, ONE_HOUR_MS)) {
        res.status(429).json({ error: "too_many_requests", scope: "phone" });
        return;
    }
    try {
        const db = (0, database_1.getDatabase)();
        const targetUidSnap = await db
            .ref(`phoneIndex/${(0, helpers_1.phoneIndexKey)(phoneE164)}`)
            .get();
        if (!targetUidSnap.exists()) {
            res.status(404).json({ error: "no_account_for_phone" });
            return;
        }
        const targetUid = targetUidSnap.val();
        const profile = (await db.ref(`users/${targetUid}`).get()).val();
        if (!profile || profile.phoneE164 !== phoneE164) {
            res.status(403).json({ error: "phone_does_not_match_account" });
            return;
        }
        const auth = (0, auth_1.getAuth)();
        await auth.updateUser(targetUid, { password: newPassword });
        await auth.revokeRefreshTokens(targetUid);
        // Best-effort cleanup of the throw-away phone-auth user. Failure here
        // does not block the password reset — the reset already succeeded.
        try {
            await auth.deleteUser(phoneAuthUid);
        }
        catch {
            // noop
        }
        await (0, audit_1.writeAudit)(targetUid, "resetPassword", { via: "phone" });
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: "reset_failed", detail: errorMessage(err) });
    }
});
/**
 * Read a portal-user profile from RTDB. Returns `null` if the node doesn't
 * exist. Catches and discards read errors so login/me never 500 on a transient
 * RTDB failure — the client still gets the ID token even if profile fetch fails.
 */
async function loadUserProfile(uid) {
    if (!uid)
        return null;
    try {
        const snap = await (0, database_1.getDatabase)().ref(`users/${uid}`).get();
        if (!snap.exists())
            return null;
        const val = snap.val();
        return (typeof val === "object" && val !== null ? val : null);
    }
    catch {
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
function extractFirebaseErrorCode(fbData) {
    const errObj = fbData?.error;
    if (errObj && typeof errObj === "object" && "message" in errObj) {
        const msg = errObj.message;
        if (typeof msg === "string")
            return msg;
    }
    return "";
}
/**
 * Best-effort error-to-string conversion for JSON error responses.
 */
function errorMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === "string")
        return err;
    return "unknown";
}
//# sourceMappingURL=auth.js.map