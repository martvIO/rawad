// Cross-boundary sync guard (TASK-TPL-1). The backend enforces two allowlists
// that MUST mirror the frontend/shared source of truth by hand:
//   • TEMPLATE_IDS  (constants.ts)  ⟷  DIGITAL_TEMPLATE_KEYS (shared digitalTemplates.js)
//   • THEME_COLORS  (constants.ts)  ⟷  DIGITAL_THEME_KEYS    (shared digitalThemes.js)
// If a new bespoke template or curated palette is added to the shared files but
// not to the backend enums, the editor PATCH is rejected (invalid_template_id /
// invalid_theme_color) — a silent, hard-to-diagnose failure at deploy time.
// This test fails loudly at CI instead. (The shared files are dependency-free
// ESM, reachable by relative path from the backend test package.)
import { describe, it, expect } from "vitest";
import { TEMPLATE_IDS, THEME_COLORS } from "../../functions/src/api/routes/digital/constants";
import { DIGITAL_TEMPLATE_KEYS } from "../../../shared/src/data/digitalTemplates.js";
import { DIGITAL_THEME_KEYS } from "../../../shared/src/styles/digitalThemes.js";

describe("digital template/theme backend↔shared sync", () => {
  it("backend TEMPLATE_IDS set-equals shared DIGITAL_TEMPLATE_KEYS", () => {
    expect(TEMPLATE_IDS).toEqual(new Set(DIGITAL_TEMPLATE_KEYS));
  });

  it("backend THEME_COLORS set-equals shared DIGITAL_THEME_KEYS", () => {
    expect(THEME_COLORS).toEqual(new Set(DIGITAL_THEME_KEYS));
  });
});
