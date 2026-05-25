// Groom Dashboard Page Object — wraps the handwritten portal's nav tabs
// and add-guest form. The groom may need to pick the invitation type
// (handwritten / digital) on first visit — pickHandwritten() forces it.

import type { Locator, Page } from "@playwright/test";

export class GroomDashboardPage {
  readonly page: Page;
  readonly navDashboard: Locator;
  readonly navGuests: Locator;
  readonly navAdd: Locator;
  readonly navProofs: Locator;
  readonly navGuestMap: Locator;

  // Add-guest form
  readonly nameField: Locator;
  readonly areaField: Locator;
  readonly typePremium: Locator;
  readonly typeVip: Locator;
  readonly addBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navDashboard = page.getByTestId("nav-groom-dashboard");
    this.navGuests    = page.getByTestId("nav-groom-guests");
    this.navAdd       = page.getByTestId("nav-groom-add");
    this.navProofs    = page.getByTestId("nav-groom-proofs");
    this.navGuestMap  = page.getByTestId("nav-groom-map");

    this.nameField    = page.getByTestId("field-guest-name");
    this.areaField    = page.getByTestId("field-guest-area");
    this.typePremium  = page.getByTestId("btn-guest-type-premium");
    this.typeVip      = page.getByTestId("btn-guest-type-vip");
    this.addBtn       = page.getByTestId("btn-add-guest");
  }

  async pickHandwritten(): Promise<void> {
    // From /portal/groom or /portal/groom/type-select, choose handwritten.
    const url = this.page.url();
    if (url.includes("type-select")) {
      await this.page.getByTestId("btn-type-handwritten").click();
    }
  }

  async gotoDashboard(): Promise<void> {
    await this.page.goto("/portal/groom/handwritten/dashboard");
  }

  async gotoGuests(): Promise<void> {
    await this.page.goto("/portal/groom/handwritten/guests");
  }

  async gotoAdd(): Promise<void> {
    await this.page.goto("/portal/groom/handwritten/add");
  }

  async addGuest(opts: { name: string; phoneNational: string; area?: string; type?: "premium" | "vip" }): Promise<void> {
    await this.gotoAdd();
    await this.nameField.fill(opts.name);
    // Phone input lives inside the PhoneInput component
    await this.page.locator(".phone-input-native").fill(opts.phoneNational);
    if (opts.area) {
      // AddressInput wraps CityField + StreetField; fill the CityField input.
      await this.areaField.locator(".input-field").first().fill(opts.area);
    }
    if (opts.type === "vip") await this.typeVip.click();
    // Wait briefly for autocompletes to close (CityField onBlur uses 200ms).
    await this.page.waitForTimeout(300);
    await this.addBtn.click();
  }

  guestRow(name: string): Locator {
    return this.page.locator(`text=${name}`).first();
  }
}
