// JOURNEY 5 — Event lifecycle propagates to the public page.
//
// groom pauses the wedding (API) → a guest opening /confirm/:groom sees the
// unavailable notice instead of the form → groom resumes → the form returns.
// Asserts the lifecycle state on /users flows through to the unauthenticated
// guest experience. Uses pause/resume (reversible, groom self-serve) and always
// restores ACTIVE at the end.

import { test, expect } from "@playwright/test";
import { InvitationPage } from "../pages/InvitationPage";
import { apiLogin, apiCall } from "../helpers/api";

test.describe("Journey — event lifecycle", () => {
  test("pause hides the confirm form; resume restores it", async ({ page, request }) => {
    test.setTimeout(60_000);
    const groomS = await apiLogin(request, "groom", "Groom1234");

    // Normalize to ACTIVE first (ignore 409 if already active/paused mismatch).
    await apiCall(request, "post", "/lifecycle/resume", { token: groomS.idToken });

    // ── Pause → public page shows the notice (form fields gone) ────────────────
    const pause = await apiCall(request, "post", "/lifecycle/pause", { token: groomS.idToken });
    expect([200, 409]).toContain(pause.status); // 200 normally; 409 if a prior run left it paused

    const inv = new InvitationPage(page);
    await inv.gotoConfirm("groom");
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    // The confirm form is replaced by EventUnavailableNotice → the name field
    // must not be present.
    await expect(inv.nameField).toHaveCount(0, { timeout: 10_000 });

    // ── Resume → form returns ──────────────────────────────────────────────────
    const resume = await apiCall(request, "post", "/lifecycle/resume", { token: groomS.idToken });
    expect(resume.status).toBe(200);

    await inv.gotoConfirm("groom");
    await expect(inv.nameField).toBeVisible({ timeout: 10_000 });

    // Safety net: ensure we leave the seeded groom ACTIVE for other specs.
    await apiCall(request, "post", "/lifecycle/resume", { token: groomS.idToken });
  });
});
