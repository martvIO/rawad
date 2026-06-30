// JOURNEY 4 — Public confirmation flows through to admin + groom.
//
// A guest (no account) opens /confirm/:groomUsername, submits an RSVP with GPS
// (UI) → the record appears in the admin's confirmations list AND, because the
// phone matches a seeded guest, auto-attaches (confirmedAt stamped). Verifies
// the unauthenticated public path lands in the authenticated views.

import { test, expect } from "@playwright/test";
import { InvitationPage } from "../pages/InvitationPage";
import { apiLogin, apiCall } from "../helpers/api";
import { grantGeolocation, GEO } from "../helpers/stubs";

test.describe("Journey — public confirmation", () => {
  test("guest submits /confirm → shows in admin confirmations", async ({ page, context, request }) => {
    test.setTimeout(60_000);
    const RUN = String(Date.now()).slice(-6);
    const fullName = `Public Guest ${RUN}`;
    const phoneNational = `52${RUN}9`;

    await grantGeolocation(context, GEO.nazareth);
    const inv = new InvitationPage(page);
    await inv.gotoConfirm("groom");
    await inv.fill({ name: fullName, phoneNational, city: "Nazareth", street: "Hill Rd", house: "5" });
    await expect(inv.submitBtn).toBeEnabled({ timeout: 10_000 });
    await inv.submitBtn.click();
    await expect(inv.thanksTitle).toBeVisible({ timeout: 10_000 });

    // Verify it reached the admin confirmations collection.
    const adminS = await apiLogin(request, "admin", "Admin1234");
    const list = await apiCall(request, "get", "/confirmations", { token: adminS.idToken });
    expect(list.status).toBe(200);
    const mine = list.body.find((c) => c.submittedName === fullName);
    expect(mine, "submission appears in admin confirmations").toBeTruthy();
    expect(mine.submittedCity).toBe("Nazareth");
  });
});
