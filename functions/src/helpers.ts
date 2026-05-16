// Shared validation + normalization helpers.
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";

const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,60}$/;
const E164_RE     = /^\+[1-9][0-9]{6,14}$/;

// Custom claims this app stamps on every signed-in user. The base
// DecodedIdToken from firebase-admin exposes everything as `[key: string]: any`
// (custom claims aren't declared), so without this typed view a typo like
// `token.rolez` would compile silently. Keep in lock-step with the claim
// shape written by users.ts/createPortalUser, updateUser.ts, setAdminClaim,
// and migrateClaims.js.
export interface DawaClaims {
  role?: "admin" | "driver" | "groom";
  username?: string;
  assignedGrooms?: Record<string, true>;
}

export function getClaims(req: CallableRequest): DawaClaims {
  return (req.auth?.token ?? {}) as DawaClaims;
}

// Authoritative server-side role check. Every admin-only callable must call
// this first; the client-side RoleGuard is convenience-only and is not the
// authoritative gate. Reads auth.token.role (the canonical claim post-migration).
export function assertAdmin(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (getClaims(req).role !== "admin") {
    throw new HttpsError("permission-denied", "Admins only.");
  }
  return req.auth.uid;
}

export function isUsername(v: unknown): v is string {
  return typeof v === "string" && USERNAME_RE.test(v);
}

export function isE164(v: unknown): v is string {
  return typeof v === "string" && E164_RE.test(v);
}

export function isRole(v: unknown): v is "groom" | "driver" | "admin" {
  return v === "groom" || v === "driver" || v === "admin";
}

// Strong-password policy — must match src/utils/password.js exactly.
// Keep the two in lock-step when changing the policy: min 8 chars,
// at least one uppercase, lowercase, and digit.
export function isStrongPassword(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length >= 8 &&
    /[A-Z]/.test(v) &&
    /[a-z]/.test(v) &&
    /[0-9]/.test(v)
  );
}

// Normalise a free-form local phone string to E.164, defaulting unknown
// country prefixes to Israel (+972). Returns null if it can't be normalised.
export function normalisePhone(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("972")) return "+" + digits;
  if (digits.startsWith("970")) return "+" + digits;
  if (digits.startsWith("0"))   return "+972" + digits.slice(1);
  // Assume already-international if it starts with another prefix.
  if (digits.length >= 7 && digits.length <= 15) return "+" + digits;
  return null;
}

// E.164 → bare digits (used as the /phoneIndex key, since '+' is illegal there).
export function phoneIndexKey(e164: string): string {
  return e164.replace(/\D/g, "");
}

export function syntheticEmail(username: string): string {
  // Synthetic addresses live in a sentinel "@dawa.local" namespace; this is
  // never used to email the user. Username uniqueness is enforced via
  // /usernameIndex AND the Firebase Auth email-uniqueness check.
  return `${username.toLowerCase()}@dawa.local`;
}
