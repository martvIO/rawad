// JOURNEY 1 — Physical delivery lifecycle (the flagship cross-role story).
//
// guest record created under the groom (API — the groom handwritten UI is gated
// behind FEATURES.physical/beta, but the BACKEND guest API is live) → admin
// mints an invite link (API, admin-only) → guest opens the public invite link
// and submits their address + GPS (UI, fresh context — public pages are not
// gated) → driver marks delivered + attaches a proof (API) → groom sees the
// delivered state + proof flow through (API verify). Data created by one role
// surfaces to the next — that's the integration this asserts, independent of the
// physical UI flag.

import { test, expect } from "@playwright/test";
import { InvitationPage } from "../pages/InvitationPage";
import { apiLogin, apiCall, mintInvite } from "../helpers/api";
import { grantGeolocation, GEO } from "../helpers/stubs";

test.describe("Journey — physical delivery", () => {
  test("guest created → invite minted → submitted → delivered → visible to groom", async ({ page, context, request }) => {
    test.setTimeout(90_000);
    const RUN = String(Date.now()).slice(-6);
    const name = `Journey Guest ${RUN}`;

    const groomS = await apiLogin(request, "groom", "Groom1234");
    const adminS = await apiLogin(request, "admin", "Admin1234");

    // ── 1. Guest added under the groom (API) ───────────────────────────────────
    const created = await apiCall(request, "post", `/guests/${groomS.uid}`, {
      token: groomS.idToken,
      data: { name, phone: `+97250${RUN}1`, status: "pending", inviteType: "premium", area: "Haifa" },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const guestId = created.body.id;

    // ── 2. Admin mints the per-guest invite link (admin-only) ──────────────────
    const token = await mintInvite(request, adminS, groomS.uid, guestId);

    // ── 3. Guest opens the public link in a fresh context + submits + GPS ──────
    const guestCtx = await context.browser()!.newContext();
    await grantGeolocation(guestCtx, GEO.haifa);
    const guestPage = await guestCtx.newPage();
    const inv = new InvitationPage(guestPage);
    await inv.gotoInvite(token);
    await guestPage.getByTestId("field-city").first().fill("Haifa");
    await inv.nameField.click(); // blur the city autocomplete
    await guestPage.getByTestId("consent-checkbox").check(); // Terms consent is now required
    await expect(inv.submitBtn).toBeEnabled({ timeout: 10_000 });
    await inv.submitBtn.click();
    await expect(inv.thanksTitle).toBeVisible({ timeout: 10_000 });
    await guestCtx.close();

    // ── 4. Driver marks delivered + proof (API: verified delivery path) ────────
    const driverS = await apiLogin(request, "driver", "Driver1234");
    const proofPath = `proofs/${groomS.uid}/${guestId}.jpg`;
    const patch = await apiCall(request, "patch", `/guests/${groomS.uid}/${guestId}`, {
      token: driverS.idToken,
      data: { status: "delivered", proofPhotoPath: proofPath, deliveredBy: "Test Driver", deliveredAt: new Date().toISOString() },
    });
    expect(patch.status).toBe(200);

    // ── 5. Groom sees the delivered state + proof (the data flowed end-to-end) ──
    const after = await apiCall(request, "get", `/guests/${groomS.uid}`, { token: groomS.idToken });
    const row = after.body.find((g) => g.id === guestId);
    expect(row?.status).toBe("delivered");
    expect(row?.proofPhotoPath).toBe(proofPath);
    expect(row?.confirmedAt, "guest confirmed via the public invite submission").toBeTruthy();

    // cleanup
    await apiCall(request, "delete", `/guests/${groomS.uid}/${guestId}`, { token: groomS.idToken });
  });
});
