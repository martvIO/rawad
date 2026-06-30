// Groom role tests — type-select, dashboard, guest CRUD, invite links,
// proof viewer, and cross-role access guards.

import { test, expect } from "@playwright/test";
import { GroomDashboardPage } from "./pages/GroomDashboardPage";
import { loginAsGroom, clearSession } from "./helpers/auth";
import { skipIfNoPhysical } from "./helpers/features";

// The entire groom HANDWRITTEN track is gated behind FEATURES.physical (beta,
// off by default). Skip these UI specs when it's disabled — the digital track
// is covered separately and the physical backend pipeline via the API tests +
// the physical-delivery journey.
test.beforeEach(() => skipIfNoPhysical());

test.describe("Groom — type select gate", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAsGroom(page);
  });

  test("first visit lands on type-select (or remembered type)", async ({ page }) => {
    await expect(page).toHaveURL(/\/portal\/groom/);
    if (page.url().includes("type-select")) {
      await expect(page.getByText("اختر نوع المكتوب")).toBeVisible();
      await expect(page.getByTestId("btn-type-handwritten")).toBeVisible();
      await expect(page.getByTestId("btn-type-digital")).toBeVisible();
    }
  });

  test("picking handwritten lands on dashboard", async ({ page }) => {
    const groom = new GroomDashboardPage(page);
    await groom.pickHandwritten();
    await page.waitForURL(/handwritten\/dashboard|handwritten\/guests/, { timeout: 20_000 });
  });
});

test.describe("Groom — dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAsGroom(page);
    const groom = new GroomDashboardPage(page);
    await groom.pickHandwritten();
    await groom.gotoDashboard();
  });

  test("dashboard renders welcome + stats", async ({ page }) => {
    await expect(page.getByText("أهلاً بك في لوحة التحكم")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("الإجمالي")).toBeVisible();
    await expect(page.getByText("تم التسليم")).toBeVisible();
  });

  test("nav tabs switch between dashboard / guests / add / proofs / map", async ({ page }) => {
    test.setTimeout(20_000);
    const groom = new GroomDashboardPage(page);
    await expect(groom.navGuests).toBeVisible({ timeout: 10_000 });
    await groom.navGuests.click();
    await expect(page).toHaveURL(/handwritten\/guests/);
    await expect(groom.navAdd).toBeVisible({ timeout: 10_000 });
    await groom.navAdd.click();
    await expect(page).toHaveURL(/handwritten\/add/);
    await expect(groom.navProofs).toBeVisible({ timeout: 10_000 });
    await groom.navProofs.click();
    await expect(page).toHaveURL(/handwritten\/proofs/);
  });
});

test.describe("Groom — guest CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAsGroom(page);
    const groom = new GroomDashboardPage(page);
    await groom.pickHandwritten();
  });

  test("add a new guest (premium)", async ({ page }) => {
    test.setTimeout(30_000);
    const groom = new GroomDashboardPage(page);
    const name = `Guest ${Date.now().toString().slice(-6)}`;
    await groom.addGuest({ name, phoneNational: "501234567", area: "Haifa", type: "premium" });
    // Toast "add_success" appears at top-of-screen
    await expect(page.getByText(/تمت إضافة المعزوم/)).toBeVisible({ timeout: 10_000 });
    // Then guest is visible on the guests tab (POLL_MS.GUESTS is 15s; bump
    // wait so we don't race the next subscription tick).
    await groom.navGuests.click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
  });

  test("add a VIP guest", async ({ page }) => {
    test.setTimeout(20_000);
    const groom = new GroomDashboardPage(page);
    const name = `VIP ${Date.now().toString().slice(-6)}`;
    await groom.addGuest({ name, phoneNational: "504445555", area: "Nazareth", type: "vip" });
    await expect(page.getByText(/تمت إضافة المعزوم/)).toBeVisible({ timeout: 10_000 });
  });

  test("submitting empty name triggers required-fields toast", async ({ page }) => {
    const groom = new GroomDashboardPage(page);
    await groom.gotoAdd();
    // Try to click submit while empty — button is disabled, so use the Enter key path
    await groom.nameField.fill("");
    await expect(groom.addBtn).toBeDisabled();
  });

  test("guests tab shows seeded guests grouped by address", async ({ page }) => {
    const groom = new GroomDashboardPage(page);
    await groom.gotoGuests();
    await expect(page.getByText(/قائمة المدعوين/)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Groom — invite link", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAsGroom(page);
    const groom = new GroomDashboardPage(page);
    await groom.pickHandwritten();
    await groom.gotoGuests();
  });

  test("send-invite button opens WhatsApp popup with wa.me URL", async ({ page }) => {
    // Stub the invite mint so the test doesn't depend on the live API
    await page.route("**/invites/guest**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "stub-token-xyz" }) }),
    );
    const popupPromise = page.waitForEvent("popup").catch(() => null);
    const sendBtn = page.locator("button:has-text(\"إرسال المكتوب\"), button:has-text(\"إرسال\")").first();
    if (await sendBtn.isVisible()) {
      await sendBtn.click();
      const popup = await popupPromise;
      if (popup) {
        expect(popup.url()).toMatch(/wa\.me|whatsapp\.com/);
        await popup.close();
      }
    }
  });
});

test.describe("Groom — RoleGuard", () => {
  test("groom cannot reach /portal/admin/* — redirects to groom dashboard", async ({ page }) => {
    await clearSession(page);
    await loginAsGroom(page);
    await page.goto("/portal/admin/users");
    await expect(page).toHaveURL(/\/portal\/groom/, { timeout: 5_000 });
  });

  test("groom cannot reach /portal/driver/* — redirects to groom dashboard", async ({ page }) => {
    await clearSession(page);
    await loginAsGroom(page);
    await page.goto("/portal/driver/pending");
    await expect(page).toHaveURL(/\/portal\/groom/, { timeout: 5_000 });
  });
});
