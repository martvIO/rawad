// @vitest-environment node
//
// Drift guard for the strong-password policy. The rule is implemented twice —
// here in backend/functions/src/helpers.ts and in frontend/src/utils/password.js
// — kept in sync only by convention. This test asserts the BACKEND
// implementation agrees with the shared canonical fixture for every case; the
// frontend has a mirror test (frontend/src/__tests__/utils/passwordPolicyParity).
// If either implementation drifts from the policy, its parity test fails in CI.
import { describe, it, expect } from "vitest";
import { isStrongPassword } from "../../functions/src/helpers";
import { PASSWORD_POLICY_CASES } from "../../../shared/passwordPolicy.cases.mjs";

describe("password policy parity (backend ↔ shared fixture)", () => {
  it.each(PASSWORD_POLICY_CASES)(
    "isStrongPassword($input) === $valid",
    ({ input, valid }) => {
      expect(isStrongPassword(input as unknown)).toBe(valid);
    }
  );
});
