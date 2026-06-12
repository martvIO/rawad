// Admin Dashboard Page Object — wraps the four admin sub-tabs (users,
// send, confirmations, settings). No assertions live here.

import type { Locator, Page } from "@playwright/test";

export class AdminDashboardPage {
  readonly page: Page;
  readonly warningBanner: Locator;
  readonly navUsers: Locator;
  readonly navSend: Locator;
  readonly navConfirmations: Locator;
  readonly navSettings: Locator;
  readonly logoutBtn: Locator;

  // Add-user form
  readonly newUserField: Locator;
  readonly newPassField: Locator;
  readonly newPhoneField: Locator;
  readonly newRoleGroom: Locator;
  readonly newRoleDriver: Locator;
  readonly newRoleAdmin: Locator;
  readonly createUserBtn: Locator;

  // User list filters
  readonly filterAll: Locator;
  readonly filterGrooms: Locator;
  readonly filterDrivers: Locator;
  readonly filterAdmins: Locator;

  constructor(page: Page) {
    this.page = page;
    this.warningBanner   = page.getByTestId("alert-admin-warning");
    this.navUsers        = page.getByTestId("nav-admin-users");
    this.navSend         = page.getByTestId("nav-admin-send");
    this.navConfirmations = page.getByTestId("nav-admin-confirmations");
    this.navSettings     = page.getByTestId("nav-admin-settings");
    this.logoutBtn       = page.getByTestId("btn-logout");

    this.newUserField    = page.getByTestId("field-new-user");
    this.newPassField    = page.getByTestId("field-new-pass");
    this.newPhoneField   = page.getByTestId("field-new-phone");
    this.newRoleGroom    = page.getByTestId("btn-new-role-groom");
    this.newRoleDriver   = page.getByTestId("btn-new-role-driver");
    this.newRoleAdmin    = page.getByTestId("btn-new-role-admin");
    this.createUserBtn   = page.getByTestId("btn-create-user");

    this.filterAll       = page.getByTestId("btn-filter-all");
    this.filterGrooms    = page.getByTestId("btn-filter-grooms");
    this.filterDrivers   = page.getByTestId("btn-filter-drivers");
    this.filterAdmins    = page.getByTestId("btn-filter-admins");
  }

  async gotoUsers(): Promise<void> {
    await this.page.goto("/portal/admin/users");
  }

  async gotoSend(): Promise<void> {
    await this.page.goto("/portal/admin/send");
  }

  async createUser(opts: { username: string; password: string; role?: "groom" | "driver" | "admin"; phoneE164?: string }): Promise<void> {
    const role = opts.role ?? "groom";
    if (role === "groom")  await this.newRoleGroom.click();
    if (role === "driver") await this.newRoleDriver.click();
    if (role === "admin")  await this.newRoleAdmin.click();
    await this.newUserField.fill(opts.username);
    await this.newPassField.fill(opts.password);
    if (opts.phoneE164) {
      const phoneInput = this.page.locator(".phone-input-native");
      await phoneInput.fill(opts.phoneE164.replace(/^\+972/, ""));
    }
    await this.createUserBtn.click();
  }

  userRow(username: string): Locator {
    // Each row renders @username with `direction: ltr; textAlign: right`
    return this.page.locator(`text=@${username}`).first();
  }

  async deleteUser(username: string): Promise<void> {
    const row = this.userRow(username).locator("..").locator("..");
    await row.getByTestId("btn-delete-user").click();
    await row.getByTestId("btn-delete-user-confirm").click();
  }
}
