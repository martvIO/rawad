// API route tests — /invites. Token-format guards, admin-only minting, the
// public token read, and the public submit's bad-token handling. Part of
// TASK-006.

import { describe, it, expect, beforeAll } from "vitest";
import { api, requireEmulator, sessions } from "./_helpers.js";

requireEmulator();

let S;
let guestId;
beforeAll(async () => {
  S = await sessions();
  const { json } = await api("GET", `/guests/${S.groom.uid}`, { token: S.groom.idToken });
  guestId = Array.isArray(json) && json[0]?.id;
});

describe("GET /invites/token/:token (public)", () => {
  it("400s on a malformed token", async () => {
    const { status, json } = await api("GET", "/invites/token/not-hex");
    expect(status).toBe(400);
    expect(json?.error).toBe("invalid_token_format");
  });

  it("404s on a well-formed but unknown token", async () => {
    const { status, json } = await api("GET", `/invites/token/${"a".repeat(32)}`);
    expect(status).toBe(404);
    expect(json?.error).toBe("token_not_found");
  });
});

describe("POST /invites (mint — admin only)", () => {
  it("401s without a token", async () => {
    const { status } = await api("POST", "/invites", { body: { groomUid: S.groom.uid, guestId } });
    expect(status).toBe(401);
  });

  it("403s for a groom (minting is an admin op)", async () => {
    const { status } = await api("POST", "/invites", {
      token: S.groom.idToken,
      body: { groomUid: S.groom.uid, guestId },
    });
    expect(status).toBe(403);
  });

  it("400s for an admin with no guestId", async () => {
    const { status, json } = await api("POST", "/invites", {
      token: S.admin.idToken,
      body: { groomUid: S.groom.uid },
    });
    expect(status).toBe(400);
    expect(json?.error).toBe("missing_required");
  });

  it("mints a 32-hex token for an admin, readable via the public endpoint", async () => {
    expect(guestId, "seed should provide a guest").toBeTruthy();
    const mint = await api("POST", "/invites", {
      token: S.admin.idToken,
      body: { groomUid: S.groom.uid, guestId },
    });
    expect(mint.status).toBe(200);
    expect(mint.json?.token).toMatch(/^[a-f0-9]{32}$/);

    const read = await api("GET", `/invites/token/${mint.json.token}`);
    expect(read.status).toBe(200);
    expect(read.json).toHaveProperty("guestName");
    expect(read.json?.eventStatus).toBeTruthy();
  });
});

describe("POST /invites/submit (public)", () => {
  it("400s on a malformed token", async () => {
    const { status } = await api("POST", "/invites/submit", {
      body: { token: "bad", submittedName: "A B", submittedPhone: "+972501112222", submittedCity: "Haifa" },
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });
});
