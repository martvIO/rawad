// Canonical password-policy fixture — the SINGLE source of truth for the
// strong-password rule, shared across the package boundary.
//
// The policy lives in TWO implementations that must never drift:
//   - frontend/src/utils/password.js   (PASSWORD_RULES / isStrongPassword)
//   - backend/functions/src/helpers.ts (isStrongPassword)
//
// Both packages' unit suites import THIS list and assert their own
// isStrongPassword agrees with every `valid` flag — so if either implementation
// changes the rule (length, character classes, type handling) without the other
// following, that package's parity test fails in CI. Edit the policy here and in
// both implementations together; the tests keep them honest.
//
// Plain ESM (no deps) so it imports cleanly from both the jsdom frontend project
// and the node backend project. `undefined`/non-string entries exercise the
// defensive type handling, which is why this is .mjs rather than .json.

export const PASSWORD_POLICY_CASES = [
  // ── Accepted: all four rules (>=8 chars, upper, lower, digit) ──
  { input: "Abcd1234", valid: true },
  { input: "Abcdfg12", valid: true }, // exactly 8 chars (lower boundary)
  { input: "Xy9zzzzz", valid: true },
  { input: "LongerP4ssword", valid: true },

  // ── Rejected: one rule each broken ──
  { input: "Abcdf12", valid: false }, // 7 chars (one below the minimum)
  { input: "abcd1234", valid: false }, // no uppercase
  { input: "ABCD1234", valid: false }, // no lowercase
  { input: "Abcdefgh", valid: false }, // no digit

  // ── Rejected: empty / non-string (defensive type handling) ──
  { input: "", valid: false },
  { input: null, valid: false },
  { input: undefined, valid: false },
  { input: 12345678, valid: false },
];
