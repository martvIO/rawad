// Shared password-strength validation. Used by every form that lets a user
// set a password (admin create-user, admin edit-user, self-service reset).
// The server enforces the same rules in functions/src/helpers.ts → isStrongPassword;
// keep the two in lock-step when changing the policy.

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
