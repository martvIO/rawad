// Drift guard for the strong-password policy (frontend side). Asserts the
// frontend isStrongPassword (utils/password.js) agrees with the shared canonical
// fixture for every case. The backend has a mirror test
// (backend/tests/functions/passwordPolicyParity). If either implementation
// drifts from the policy, its parity test fails in CI. See the fixture header
// for the single-source-of-truth rationale.
import { describe, it, expect } from "vitest";
import { isStrongPassword } from "../../utils/password.js";
import { PASSWORD_POLICY_CASES } from "../../../../shared/passwordPolicy.cases.mjs";

describe("password policy parity (frontend ↔ shared fixture)", () => {
  it.each(PASSWORD_POLICY_CASES)(
    "isStrongPassword($input) === $valid",
    ({ input, valid }) => {
      expect(isStrongPassword(input)).toBe(valid);
    }
  );
});
