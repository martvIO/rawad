// API route tests — /confirmations. Admin-only reads, and the PUBLIC submit
// endpoint's validation (name must be full, phone normalizable, city required,
// groom must resolve). Part of TASK-006.

import { describe, it, expect, beforeAll } from "vitest";
import { api, requireEmulator, sessions } from "./_helpers.js";

requireEmulator();

let S;
beforeAll(async () => {
  S = await sessions();
});

describe("GET /confirmations (admin only)", () => {
  it("401s without a token", async () => {
    const { status } = await api("GET", "/confirmations");
    expect(status).toBe(401);
  });
  it("403s for a groom", async () => {
    const { status } = await api("GET", "/confirmations", { token: S.groom.idToken });
    expect(status).toBe(403);
  });
  it("returns an array for an admin", async () => {
    const { status, json } = await api("GET", "/confirmations", { token: S.admin.idToken });
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });
});

describe("POST /confirmations (public submit)", () => {
  it("accepts a valid submission for the seeded groom", async () => {
    const { status, json } = await api("POST", "/confirmations", {
      body: {
        groomUsername: "groom",
        submittedName: "Public Guest",
        submittedPhone: "+972503334444",
        submittedCity: "Haifa",
      },
    });
    expect(status).toBe(200);
    expect(json?.ok).toBe(true);
    expect(json).toHaveProperty("id");
  });

  it("404s for an unknown groom", async () => {
    const { status, json } = await api("POST", "/confirmations", {
      body: { groomUsername: "nosuchgroom", submittedName: "A B", submittedPhone: "+972501112222", submittedCity: "Haifa" },
    });
    expect(status).toBe(404);
    expect(json?.error).toBe("unknown_groom");
  });

  it("400s when the name is a single word (must be full name)", async () => {
    const { status, json } = await api("POST", "/confirmations", {
      body: { groomUsername: "groom", submittedName: "Mononym", submittedPhone: "+972501113333", submittedCity: "Haifa" },
    });
    expect(status).toBe(400);
    expect(json?.error).toBe("name_must_be_full");
  });

  it("400s when the city is missing", async () => {
    const { status, json } = await api("POST", "/confirmations", {
      body: { groomUsername: "groom", submittedName: "Full Name", submittedPhone: "+972501114444" },
    });
    expect(status).toBe(400);
    expect(json?.field).toBe("submittedCity");
  });
});
