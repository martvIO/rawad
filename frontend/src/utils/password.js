// Shared password-strength validation. Used by every form that lets a user
// set a password (admin create-user, admin edit-user, self-service reset).
// The server enforces the same rules in functions/src/helpers.ts → isStrongPassword.
// The single source of truth for the RULE is the shared fixture
// shared/passwordPolicy.cases.mjs: both packages' parity tests assert their
// isStrongPassword against it, so the two can't drift without CI failing
// (see __tests__/utils/passwordPolicyParity.test.js). Edit all three together.

// Rule definitions. `id` doubles as the i18n key suffix (`pwd_rule_<id>`).
export const PASSWORD_RULES = [
  { id: "min_length", check: (p) => typeof p === "string" && p.length >= 8 },
  { id: "uppercase",  check: (p) => /[A-Z]/.test(p || "") },
  { id: "lowercase",  check: (p) => /[a-z]/.test(p || "") },
  { id: "number",     check: (p) => /[0-9]/.test(p || "") },
];

// Returns an array of { id, passed } — used by the <PasswordRules> component.
export function evaluatePassword(pwd) {
  return PASSWORD_RULES.map(({ id, check }) => ({ id, passed: check(pwd) }));
}

// Boolean shortcut — true iff every rule passes.
export function isStrongPassword(pwd) {
  return PASSWORD_RULES.every(({ check }) => check(pwd));
}
