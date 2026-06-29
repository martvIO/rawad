// API route tests — /auth. Login shapes, error paths, the protected /auth/me
// boundary. Part of TASK-006 (route-level coverage).

import { describe, it, expect } from "vitest";
import { api, login, CREDS, requireEmulator, sessions } from "./_helpers.js";

requireEmulator();

describe("POST /auth/login", () => {
  it("returns an idToken + role for valid admin credentials", async () => {
    const j = await login(CREDS.admin.username, CREDS.admin.password);
    expect(j.idToken).toBeTruthy();
    expect(j.role).toBe("admin");
    expect(j.uid).toBeTruthy();
  });

  it("returns role=groom / role=driver for the other seeded accounts", async () => {
    const { groom, driver } = await sessions();
    expect(groom.role).toBe("groom");
    expect(driver.role).toBe("driver");
  });

  it("rejects a wrong password with a 4xx (never 200)", async () => {
    const { status, json } = await api("POST", "/auth/login", {
      body: { username: CREDS.admin.username, password: "definitely-wrong" },
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    expect(json?.idToken).toBeFalsy();
  });

  it("rejects a missing body with a 4xx", async () => {
    const { status } = await api("POST", "/auth/login", { body: {} });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });
});

describe("GET /auth/me", () => {
  it("401s without a token", async () => {
    const { status } = await api("GET", "/auth/me");
    expect(status).toBe(401);
  });

  it("returns the caller's profile + claims with a valid token", async () => {
    const { admin } = await sessions();
    const { status, json } = await api("GET", "/auth/me", { token: admin.idToken });
    expect(status).toBe(200);
    expect(json?.uid).toBe(admin.uid);
    // role is exposed either at top level or under claims, depending on shape.
    const role = json?.role ?? json?.claims?.role;
    expect(role).toBe("admin");
  });

  it("401s on a garbage bearer token", async () => {
    const { status } = await api("GET", "/auth/me", { token: "not-a-real-token" });
    expect(status).toBe(401);
  });
});
