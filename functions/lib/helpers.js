"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClaims = getClaims;
exports.assertAdmin = assertAdmin;
exports.isUsername = isUsername;
exports.isE164 = isE164;
exports.isRole = isRole;
exports.isFiniteInRange = isFiniteInRange;
exports.normalisePhoneForMatching = normalisePhoneForMatching;
exports.isStrongPassword = isStrongPassword;
exports.normalisePhone = normalisePhone;
exports.phoneIndexKey = phoneIndexKey;
exports.syntheticEmail = syntheticEmail;
// Shared validation + normalization helpers.
const https_1 = require("firebase-functions/v2/https");
const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,60}$/;
const E164_RE = /^\+[1-9][0-9]{6,14}$/;
function getClaims(req) {
    return (req.auth?.token ?? {});
}
// Authoritative server-side role check. Every admin-only callable must call
// this first; the client-side RoleGuard is convenience-only and is not the
// authoritative gate. Reads auth.token.role (the canonical claim post-migration).
function assertAdmin(req) {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign in required.");
    if (getClaims(req).role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Admins only.");
    }
    return req.auth.uid;
}
function isUsername(v) {
    return typeof v === "string" && USERNAME_RE.test(v);
}
function isE164(v) {
    return typeof v === "string" && E164_RE.test(v);
}
function isRole(v) {
    return v === "groom" || v === "driver" || v === "admin";
}
// Finite-number guard with optional inclusive bounds. Used by Cloud Functions
// that accept GPS coordinates from clients and need to reject NaN/Infinity/
// out-of-range values before persisting.
function isFiniteInRange(v, min, max) {
    return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}
// Phone-normaliser used for matching only: strip non-digits, drop common
// country prefixes (+972 / +970), and drop a leading 0. The result is a bare
// local digit sequence suitable for equality comparison across formats.
// Keep in sync with the client-side normalizePhoneForMatching in matchUtils.js.
function normalisePhoneForMatching(raw) {
    if (typeof raw !== "string")
        return "";
    let d = raw.replace(/\D/g, "");
    if (!d)
        return "";
    if (d.startsWith("00972"))
        d = d.slice(5);
    else if (d.startsWith("972"))
        d = d.slice(3);
    else if (d.startsWith("00970"))
        d = d.slice(5);
    else if (d.startsWith("970"))
        d = d.slice(3);
    if (d.startsWith("0"))
        d = d.slice(1);
    return d;
}
// Strong-password policy — must match src/utils/password.js exactly.
// Keep the two in lock-step when changing the policy: min 8 chars,
// at least one uppercase, lowercase, and digit.
function isStrongPassword(v) {
    return (typeof v === "string" &&
        v.length >= 8 &&
        /[A-Z]/.test(v) &&
        /[a-z]/.test(v) &&
        /[0-9]/.test(v));
}
// Normalise a free-form local phone string to E.164, defaulting unknown
// country prefixes to Israel (+972). Returns null if it can't be normalised.
function normalisePhone(raw) {
    if (typeof raw !== "string")
        return null;
    const digits = raw.replace(/\D/g, "");
    if (!digits)
        return null;
    if (digits.startsWith("972"))
        return "+" + digits;
    if (digits.startsWith("970"))
        return "+" + digits;
    if (digits.startsWith("0"))
        return "+972" + digits.slice(1);
    // Assume already-international if it starts with another prefix.
    if (digits.length >= 7 && digits.length <= 15)
        return "+" + digits;
    return null;
}
// E.164 → bare digits (used as the /phoneIndex key, since '+' is illegal there).
function phoneIndexKey(e164) {
    return e164.replace(/\D/g, "");
}
function syntheticEmail(username) {
    // Synthetic addresses live in a sentinel "@dawa.local" namespace; this is
    // never used to email the user. Username uniqueness is enforced via
    // /usernameIndex AND the Firebase Auth email-uniqueness check.
    return `${username.toLowerCase()}@dawa.local`;
}
//# sourceMappingURL=helpers.js.map