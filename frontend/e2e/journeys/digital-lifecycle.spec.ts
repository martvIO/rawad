// JOURNEY 2 — Digital invitation lifecycle.
//
// groom creates a digital guest (API) → admin mints a digital invite link (API,
// admin-only) → the guest opens the rendered digital invitation page (UI render
// check) → submits an RSVP + a guestbook wish (API: the /d page's RSVP controls
// aren't stably selectable yet) → the RSVP/wish are accepted end-to-end. Skips
// gracefully if the digital store isn't provisioned in this emulator.

import { test, expect } from "@playwright/test";
import { apiLogin, apiCall } from "../helpers/api";

test.describe("Journey — digital lifecycle", () => {
  test("digital guest → invite minted → invitation renders → RSVP + wish accepted", async ({ page, request }) => {
    test.setTimeout(75_000);
    const RUN = String(Date.now()).slice(-6);
    const groomS = await apiLogin(request, "groom", "Groom1234");
    const adminS = await apiLogin(request, "admin", "Admin1234");

    // ── 1. Groom creates a digital guest (API) ─────────────────────────────────
    const create = await apiCall(request, "post", `/digital/${groomS.uid}/guests`, {
      token: groomS.idToken,
      data: { name: `Digital Guest ${RUN}`, phone: `053${RUN}1` },
    });
    if (create.status !== 200) {
      test.skip(true, `digital guest store not provisioned (create → ${create.status}); covered by feature specs`);
      return;
    }
    const guestId = create.body.id;
    expect(guestId).toBeTruthy();

    // ── 2. Approve the groom's default design (admin) so invites can be minted ──
    // (Minting a digital invite requires an approved design — a real product
    // constraint. GET /designs auto-creates the default; set-status is the admin
    // override that approves it from any state.)
    const designs = await apiCall(request, "get", `/digital/${groomS.uid}/designs`, { token: groomS.idToken });
    expect(designs.status).toBe(200);
    const designId = (designs.body.find((d) => d.isDefault) ?? designs.body[0])?.id;
    expect(designId, "groom has a default design").toBeTruthy();
    const approve = await apiCall(request, "post", `/digital/${groomS.uid}/designs/${designId}/design/set-status`, {
      token: adminS.idToken,
      data: { status: "approved" },
    });
    expect(approve.status, JSON.stringify(approve.body)).toBe(200);

    // ── 3. Admin mints a digital invite link ───────────────────────────────────
    const mint = await apiCall(request, "post", "/invites/digital", {
      token: adminS.idToken,
      data: { groomUid: groomS.uid, guestId },
    });
    expect(mint.status, `mint digital invite → ${JSON.stringify(mint.body)}`).toBe(200);
    const token = mint.body.token as string;
    expect(token).toMatch(/^[a-f0-9]{32}$/);

    // ── 3. The rendered digital invitation page loads without crashing ─────────
    // The /d page is a heavy WebGL experience whose "load" event can be slow, so
    // wait only for the navigation commit, then assert content rendered.
    await page.goto(`/d/groom/${token}`, { waitUntil: "commit" });
    await page.waitForTimeout(1500);
    await expect(page.locator("body")).not.toBeEmpty();

    // ── 4. Guest RSVPs + leaves a guestbook wish (API) ─────────────────────────
    const rsvp = await apiCall(request, "post", "/invites/digital/submit", {
      // submittedPhone is required by the digital RSVP endpoint.
      data: { token, rsvp: "attending", submittedPhone: `+97253${RUN}1`, companions: 2, note: "Mabrook!" },
    });
    expect(rsvp.status, JSON.stringify(rsvp.body)).toBe(200);

    const wish = await apiCall(request, "post", "/invites/digital/wish", {
      data: { token, who: `Digital Guest ${RUN}`, what: "Wishing you a lifetime of happiness" },
    });
    expect([200, 201]).toContain(wish.status);

    // ── 5. The guest now appears in the groom's digital guest list ─────────────
    const list = await apiCall(request, "get", `/digital/${groomS.uid}/guests`, { token: groomS.idToken });
    expect(list.status).toBe(200);
    expect(list.body.some((g) => g.id === guestId)).toBe(true);
  });
});
