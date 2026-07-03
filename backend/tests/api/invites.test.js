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

describe("POST /invites/manual-sent (admin stamps a manual wa.me send)", () => {
  it("stamps a PHYSICAL guest — visible via GET /guests/:groomUid", async () => {
    // Create the guest through the API (like the digital case below) — seed
    // RTDB writes are not visible to the functions emulator, and this keeps
    // the test independent of seed state either way.
    const create = await api("POST", `/guests/${S.groom.uid}`, {
      token: S.admin.idToken,
      body: { name: "Manual Physical", phone: "+972500006666", status: "pending", inviteType: "premium" },
    });
    expect(create.status).toBe(200);
    const physicalId = create.json?.id;
    expect(physicalId).toBeTruthy();

    const stamp = await api("POST", "/invites/manual-sent", {
      token: S.admin.idToken,
      body: { type: "physical", groomUid: S.groom.uid, guestId: physicalId },
    });
    expect(stamp.status).toBe(200);
    expect(stamp.json?.ok).toBe(true);

    const { status, json } = await api("GET", `/guests/${S.groom.uid}`, { token: S.admin.idToken });
    expect(status).toBe(200);
    const g = json.find((x) => x.id === physicalId);
    expect(g?.inviteWaStatus).toBe("manual");
    expect(typeof g?.inviteWaStatusAt).toBe("number");

    await api("DELETE", `/guests/${S.groom.uid}/${physicalId}`, { token: S.admin.idToken });
  });

  it("stamps a DIGITAL guest — visible via the digital guests list", async () => {
    // The seed only creates RTDB guests, so mint a digital guest through the API.
    const create = await api("POST", `/digital/${S.groom.uid}/guests`, {
      token: S.admin.idToken,
      body: { name: "Manual Digital", phone: "+972500005555" },
    });
    expect(create.status).toBe(200);
    const digitalId = create.json?.id;
    expect(digitalId).toBeTruthy();

    const stamp = await api("POST", "/invites/manual-sent", {
      token: S.admin.idToken,
      body: { type: "digital", groomUid: S.groom.uid, guestId: digitalId },
    });
    expect(stamp.status).toBe(200);
    expect(stamp.json?.ok).toBe(true);

    const list = await api("GET", `/digital/${S.groom.uid}/guests`, { token: S.admin.idToken });
    expect(list.status).toBe(200);
    const g = (list.json ?? []).find((x) => x.id === digitalId);
    expect(g?.inviteWaStatus).toBe("manual");
    expect(typeof g?.inviteWaStatusAt).toBe("number");

    // Clean up so a duplicate-phone check can't trip a re-run.
    await api("DELETE", `/digital/${S.groom.uid}/guests/${digitalId}`, { token: S.admin.idToken });
  });

  it("404s for an unknown guest", async () => {
    const { status, json } = await api("POST", "/invites/manual-sent", {
      token: S.admin.idToken,
      body: { type: "physical", groomUid: S.groom.uid, guestId: "no-such-guest" },
    });
    expect(status).toBe(404);
    expect(json?.error).toBe("guest_not_found");
  });

  it("400s on a missing guestId and on an invalid type", async () => {
    const missing = await api("POST", "/invites/manual-sent", {
      token: S.admin.idToken,
      body: { type: "physical", groomUid: S.groom.uid },
    });
    expect(missing.status).toBe(400);
    expect(missing.json?.error).toBe("missing_required");

    // Literal guestId: the type check runs before any DB access, so this must
    // not depend on seed state (an absent seed guest would turn the failure
    // into missing_required and mask the assertion).
    const badType = await api("POST", "/invites/manual-sent", {
      token: S.admin.idToken,
      body: { type: "email", groomUid: S.groom.uid, guestId: "any-guest" },
    });
    expect(badType.status).toBe(400);
    expect(badType.json?.error).toBe("invalid_type");

    const badId = await api("POST", "/invites/manual-sent", {
      token: S.admin.idToken,
      body: { type: "physical", groomUid: S.groom.uid, guestId: "nested/leaf" },
    });
    expect(badId.status).toBe(400);
    expect(badId.json?.error).toBe("invalid_id");
  });
});
