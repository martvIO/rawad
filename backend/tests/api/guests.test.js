// API route tests — /guests. Role-guard enforcement (the explicit authz the
// Admin SDK bypass requires), ownership, validation, and the driver
// create/delete exclusion. Part of TASK-006.

import { describe, it, expect, beforeAll } from "vitest";
import { api, requireEmulator, sessions } from "./_helpers.js";

requireEmulator();

let S; // sessions
beforeAll(async () => {
  S = await sessions();
});

describe("GET /guests (admin flat list)", () => {
  it("401s without a token", async () => {
    const { status } = await api("GET", "/guests");
    expect(status).toBe(401);
  });

  it("403s for a non-admin (groom)", async () => {
    const { status, json } = await api("GET", "/guests", { token: S.groom.idToken });
    expect(status).toBe(403);
    expect(json?.error).toBe("admins_only");
  });

  it("returns an array for an admin", async () => {
    const { status, json } = await api("GET", "/guests", { token: S.admin.idToken });
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    // Seed inserts two guests under the groom.
    expect(json.length).toBeGreaterThanOrEqual(2);
    expect(json[0]).toHaveProperty("groomUid");
  });
});

describe("GET /guests/:groomUid (scoped)", () => {
  it("owning groom can read their own guests", async () => {
    const { status, json } = await api("GET", `/guests/${S.groom.uid}`, { token: S.groom.idToken });
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  it("assigned driver can read but never sees inviteLinkToken", async () => {
    const { status, json } = await api("GET", `/guests/${S.groom.uid}`, { token: S.driver.idToken });
    expect(status).toBe(200);
    for (const g of json) expect(g).not.toHaveProperty("inviteLinkToken");
  });
});

describe("POST/PATCH/DELETE /guests (write authz + validation)", () => {
  it("owning groom can create, then delete, a guest", async () => {
    const create = await api("POST", `/guests/${S.groom.uid}`, {
      token: S.groom.idToken,
      body: { name: "Api Test", phone: "+972500009999", status: "pending", inviteType: "premium" },
    });
    expect(create.status).toBe(200);
    expect(create.json?.id).toBeTruthy();

    const del = await api("DELETE", `/guests/${S.groom.uid}/${create.json.id}`, { token: S.groom.idToken });
    expect(del.status).toBe(200);
    expect(del.json?.ok).toBe(true);
  });

  it("400s on a create missing required fields", async () => {
    const { status, json } = await api("POST", `/guests/${S.groom.uid}`, {
      token: S.groom.idToken,
      body: { name: "No Phone" }, // missing phone/status/inviteType
    });
    expect(status).toBe(400);
    expect(json?.error).toBe("missing_required");
  });

  it("403s when a driver tries to CREATE a guest (drivers deliver, not create)", async () => {
    const { status, json } = await api("POST", `/guests/${S.groom.uid}`, {
      token: S.driver.idToken,
      body: { name: "Driver Made", phone: "+972500008888", status: "pending", inviteType: "premium" },
    });
    expect(status).toBe(403);
    expect(json?.error).toBe("forbidden");
  });

  it("assigned driver CAN patch an existing guest's status", async () => {
    // Create via the groom, mutate via the driver, then clean up via the groom.
    const create = await api("POST", `/guests/${S.groom.uid}`, {
      token: S.groom.idToken,
      body: { name: "Patch Target", phone: "+972500007777", status: "pending", inviteType: "premium" },
    });
    expect(create.status).toBe(200);
    const patch = await api("PATCH", `/guests/${S.groom.uid}/${create.json.id}`, {
      token: S.driver.idToken,
      body: { status: "delivered" },
    });
    expect(patch.status).toBe(200);
    expect(patch.json?.ok).toBe(true);
    await api("DELETE", `/guests/${S.groom.uid}/${create.json.id}`, { token: S.groom.idToken });
  });

  it("400s on an invalid status enum", async () => {
    const { status, json } = await api("POST", `/guests/${S.groom.uid}`, {
      token: S.groom.idToken,
      body: { name: "Bad Status", phone: "+972500006666", status: "teleported", inviteType: "premium" },
    });
    expect(status).toBe(400);
    expect(json?.error).toBe("invalid_status");
  });
});
