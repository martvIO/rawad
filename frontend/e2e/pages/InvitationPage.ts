// Invitation Page Object — covers both /confirm/:groomUsername (public)
// and /invite/:token (per-guest with prefilled data).

import type { Locator, Page } from "@playwright/test";

export class InvitationPage {
  readonly page: Page;
  readonly nameField: Locator;
  readonly streetField: Locator;
  readonly houseField: Locator;
  readonly submitBtn: Locator;
  readonly errorBox: Locator;
  readonly thanksTitle: Locator;
  readonly invalidTitle: Locator;
  readonly expiredTitle: Locator;
  readonly usedTitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameField    = page.getByTestId("field-conf-name");
    this.streetField  = page.getByTestId("field-conf-street");
    this.houseField   = page.getByTestId("field-conf-house");
    this.submitBtn    = page.getByTestId("btn-conf-submit");
    this.errorBox     = page.getByTestId("alert-conf-error");
    this.thanksTitle  = page.getByTestId("conf-thanks-title");
    this.invalidTitle = page.getByTestId("conf-invalid-title");
    this.expiredTitle = page.getByTestId("conf-expired-title");
    this.usedTitle    = page.getByTestId("conf-used-title");
  }

  async gotoConfirm(groomUsername: string): Promise<void> {
    await this.page.goto(`/confirm/${groomUsername}`);
  }

  async gotoInvite(token: string): Promise<void> {
    await this.page.goto(`/invite/${token}`);
  }

  /** Fill the form. Phone uses the PhoneInput component (national digits). */
  async fill(opts: { name: string; phoneNational: string; city: string; street?: string; house?: string }): Promise<void> {
    await this.nameField.fill(opts.name);
    await this.page.locator(".phone-input-native").first().fill(opts.phoneNational);
    // CityField (autocomplete) was tagged with data-testid="field-city".
    await this.page.getByTestId("field-city").first().fill(opts.city);
    if (opts.street) await this.streetField.fill(opts.street);
    if (opts.house)  await this.houseField.fill(opts.house);
    // Click outside to trigger CityField's onBlur (closes the suggestion menu)
    await this.nameField.click();
    // The Terms consent checkbox is now REQUIRED before the form will submit.
    await this.page.getByTestId("consent-checkbox").check();
  }
}
