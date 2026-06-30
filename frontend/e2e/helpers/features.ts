// Feature-flag awareness for the e2e suite.
//
// The handwritten / driver / "physical" track is gated behind a COMPILE-TIME
// flag — FEATURES.physical in frontend/src/config/index.js — which is currently
// `false` (beta, off for everyone; there is intentionally no runtime toggle).
// When it's off, the groom "Handwritten" option, the whole driver portal, proof
// photos, and GPS are NOT reachable in the UI, so UI tests for them would fail
// against a feature users can't actually use. We SKIP them instead (honest
// "skipped", not "failed"). The BACKEND physical APIs are NOT gated, so the
// physical pipeline is still covered at the API/journey level.
//
// Sync: this mirrors FEATURES.physical. config/index.js can't be imported here
// (it reads import.meta.env, which throws in the Node test context). When you
// flip FEATURES.physical and rebuild, run the suite with TEST_PHYSICAL=1 (or set
// it permanently here) so the physical UI tests light up.

import { test } from "@playwright/test";

export const PHYSICAL_ENABLED = process.env.TEST_PHYSICAL === "1";

/** Skip the current test/describe when the physical/handwritten/driver track is off. */
export function skipIfNoPhysical(): void {
  test.skip(!PHYSICAL_ENABLED, "physical/handwritten/driver track disabled (FEATURES.physical=false; set TEST_PHYSICAL=1 to run)");
}
