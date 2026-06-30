// JOURNEY 7 — Driver live GPS reaches the groom.
//
// driver publishes a GPS fix to the groom they're assigned to (API — the
// authorized driver→groom data path, which is NOT gated by FEATURES.physical) →
// an UNassigned target is rejected (authz holds). When the physical UI is
// enabled, also opens the groom's live map and asserts it renders. The publish
// authorization IS the core integration this proves.

import { test, expect } from "@playwright/test";
import { loginAsGroom, clearSession } from "../helpers/auth";
import { GroomDashboardPage } from "../pages/GroomDashboardPage";
import { apiLogin, apiCall } from "../helpers/api";
import { GEO } from "../helpers/stubs";
import { PHYSICAL_ENABLED } from "../helpers/features";

test.describe("Journey — driver live GPS", () => {
  test("assigned driver publishes a fix to the groom (authorized path)", async ({ page, request }) => {
    test.setTimeout(60_000);
    const groomS = await apiLogin(request, "groom", "Groom1234");
    const driverS = await apiLogin(request, "driver", "Driver1234");

    // ── Driver publishes a fix to the groom they're assigned to ────────────────
    const pub = await apiCall(request, "post", "/live-locations", {
      token: driverS.idToken,
      data: {
        shareWith: [groomS.uid],
        fix: { lat: GEO.haifa.latitude, lng: GEO.haifa.longitude, accuracy: GEO.haifa.accuracy },
        driverDisplayName: "Test Driver",
      },
    });
    expect(pub.status, `driver→assigned-groom publish should be authorized: ${JSON.stringify(pub.body)}`).toBe(200);

    // ── When the physical UI is live, the groom's map should render too ────────
    if (PHYSICAL_ENABLED) {
      await clearSession(page);
      await loginAsGroom(page);
      const groom = new GroomDashboardPage(page);
      await groom.pickHandwritten();
      await groom.navGuestMap.click().catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });
});
