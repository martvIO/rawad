// Login Page Object — used by auth specs. Selectors lean on
// data-testid attributes (see e2e/TESTID_REGISTRY.md).

import type { Locator, Page } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly userInput: Locator;
  readonly passInput: Locator;
  readonly submitBtn: Locator;
  readonly errorBox: Locator;
  readonly backBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.userInput = page.getByTestId("field-login-user");
    this.passInput = page.getByTestId("field-login-pass");
    this.submitBtn = page.getByTestId("btn-login-submit");
    this.errorBox  = page.getByTestId("alert-login-error");
    this.backBtn   = page.getByTestId("btn-login-back");
  }

  async goto(): Promise<void> {
    await this.page.goto("/portal/login");
  }

  async login(user: string, pass: string): Promise<void> {
    await this.userInput.fill(user);
    await this.passInput.fill(pass);
    await this.submitBtn.click();
  }
}
