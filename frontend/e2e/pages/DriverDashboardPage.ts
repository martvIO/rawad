// Driver Dashboard Page Object — wraps the pick-groom gate, delivery list,
// map tab, and live-location share panel.

import type { Locator, Page } from "@playwright/test";

export class DriverDashboardPage {
  readonly page: Page;
  readonly pickGroomField: Locator;
  readonly pickGroomSubmit: Locator;
  readonly pickGroomError: Locator;

  readonly navPending: Locator;
  readonly navMap: Locator;
  readonly navLocation: Locator;
  readonly navShared: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pickGroomField  = page.getByTestId("field-driver-pick-groom");
    this.pickGroomSubmit = page.getByTestId("btn-driver-pick-groom-submit");
    this.pickGroomError  = page.getByTestId("alert-driver-pick-error");

    this.navPending  = page.getByTestId("nav-driver-pending");
    this.navMap      = page.getByTestId("nav-driver-map");
    this.navLocation = page.getByTestId("nav-driver-location");
    this.navShared   = page.getByTestId("nav-driver-shared");
  }

  async pickGroom(username: string): Promise<void> {
    await this.pickGroomField.fill(username);
    await this.pickGroomSubmit.click();
  }

  async gotoPending(): Promise<void> {
    await this.page.goto("/portal/driver/pending");
  }
}
