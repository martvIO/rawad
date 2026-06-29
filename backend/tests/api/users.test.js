// API route tests — /users. Admin-only collection, create/delete round-trip,
// and validation (username/role/password). Part of TASK-006.

import { describe, it, expect, beforeAll } from "vitest";
import { api, requireEmulator, sessions } from "./_helpers.js";

requireEmulator();

let S;
beforeAll(async () => {
  S = await sessions();
});

describe("GET /users (admin only)", () => {
  it("401s without a token", async () => {
    const { status } = await api("GET", "/users");
    expect(status).toBe(401);
  });
  it("403s for a driver", async () => {
    const { status } = await api("GET", "/users", { token: S.driver.idToken });
    expect(status).toBe(403);
  });
  it("returns the seeded users for an admin", async () => {
    const { status, json } = await api("GET", "/users", { token: S.admin.idToken });
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    const names = json.map((u) => u.username);
    expect(names).toEqual(expect.arrayContaining(["admin", "groom", "driver"]));
  });
});

describe("POST /users (create) + DELETE round-trip", () => {
  it("admin can create then delete a groom user", async () => {
    const username = `apitest${String(Date.now()).slice(-6)}`;
    const create = await api("POST", "/users", {
      token: S.admin.idToken,
      body: { username, password: "StrongPass1!", role: "groom" },
    });
    expect(create.status).toBe(200);
    expect(create.json?.uid).toBeTruthy();

    const del = await api("DELETE", `/users/${create.json.uid}`, { token: S.admin.idToken });
    expect([200, 204]).toContain(del.status);
  });

  it("409s on a duplicate username", async () => {
    const { status, json } = await api("POST", "/users", {
      token: S.admin.idToken,
      body: { username: "groom", password: "StrongPass1!", role: "groom" },
    });
    expect(status).toBe(409);
    expect(json?.error).toBe("username_taken");
  });

  it("400s on a weak password", async () => {
    const { status, json } = await api("POST", "/users", {
      token: S.admin.idToken,
      body: { username: `weak${String(Date.now()).slice(-6)}`, password: "123", role: "groom" },
    });
    expect(status).toBe(400);
    expect(json?.error).toBe("weak_password");
  });

  it("403s when a non-admin tries to create a user", async () => {
    const { status } = await api("POST", "/users", {
      token: S.groom.idToken,
      body: { username: `nope${String(Date.now()).slice(-6)}`, password: "StrongPass1!", role: "groom" },
    });
    expect(status).toBe(403);
  });
});
