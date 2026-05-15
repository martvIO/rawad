// Shared validation + normalization helpers.

const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,60}$/;
const E164_RE     = /^\+[1-9][0-9]{6,14}$/;

export function isUsername(v: unknown): v is string {
  return typeof v === "string" && USERNAME_RE.test(v);
}

export function isE164(v: unknown): v is string {
  return typeof v === "string" && E164_RE.test(v);
}

export function isRole(v: unknown): v is "groom" | "driver" | "admin" {
  return v === "groom" || v === "driver" || v === "admin";
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
