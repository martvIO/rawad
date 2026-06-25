// Cryptographically-strong random password generator for auto-provisioned
// accounts (the post-payment groom signup flow). The generated password is
// delivered to the groom over WhatsApp and shown to the admin as a fallback,
// then the groom is forced to change it on first login.
//
// Guarantees a password that satisfies isStrongPassword() in helpers.ts (≥8
// chars, upper + lower + digit) — in fact a strict superset: 16 chars with at
// least one upper, lower, digit AND symbol. Uses node:crypto's randomInt CSPRNG
// (never Math.random). Ambiguous look-alike characters (0/O, 1/l/I) are omitted
// so the password is less error-prone to type from a WhatsApp message.

import { randomInt } from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l, o
const DIGITS = "23456789"; // no 0, 1
const SYMBOLS = "!@#$%^&*-_=+";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const PASSWORD_LEN = 16;

/** Pick one random character from `set` using a uniform CSPRNG draw. */
function pick(set: string): string {
  return set[randomInt(set.length)];
}

/** Fisher–Yates shuffle (in place) using randomInt for an unbiased ordering. */
function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

/**
 * Generate a 16-char strong random password. Guarantees ≥1 upper, lower, digit,
 * and symbol; the remaining characters are drawn from the full set and the whole
 * thing is shuffled so the guaranteed characters aren't positionally predictable.
 */
export function generateStrongPassword(): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest: string[] = [];
  for (let i = required.length; i < PASSWORD_LEN; i++) rest.push(pick(ALL));
  return shuffle([...required, ...rest]).join("");
}
