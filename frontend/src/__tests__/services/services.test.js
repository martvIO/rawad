// Service-layer tests — covers every src/services/*.js file. Each test asserts
// the service calls `api` with the expected method, path, body, and options
// (skipAuth). The `api` module is mocked at the file level so no fetch fires
// and no token state leaks across tests.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../utils/apiClient.js", () => {
  const api = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  };
  return { api, buildApiUrl: (p) => `/api${p}` };
});

vi.mock("../../utils/tokenManager.js", () => ({
  loadStoredTokens: vi.fn(),
  storeTokens: vi.fn(),
  clearTokens: vi.fn(),
  refreshIdToken: vi.fn().mockResolvedValue("fresh.token"),
  getStoredUid: vi.fn(() => "uid-stored"),
  peekIdToken: vi.fn(() => "peek.token"),
  setAuthClearedCallback: vi.fn(),
}));

vi.mock("../../utils/poller.js", () => ({
  // Stub createPoller so the immediate tick fires once synchronously
  // (just enough to drive the callback). We don't simulate intervals.
  createPoller: vi.fn((fetchFn, cb, opts) => {
    Promise.resolve().then(async () => {
      try {
        const v = await fetchFn();
        cb(v);
      } catch {
        // swallow — caller-level handling under test elsewhere
      }
    });
    return () => {};
  }),
}));

import { api } from "../../utils/apiClient.js";
import * as tokenMgr from "../../utils/tokenManager.js";
import { createPoller } from "../../utils/poller.js";

import * as auth from "../../services/auth.js";
import * as guests from "../../services/guests.js";
import * as users from "../../services/users.js";
import * as confirmations from "../../services/confirmations.js";
import * as adminSettings from "../../services/adminSettings.js";
import * as assignments from "../../services/assignments.js";
import * as invites from "../../services/invites.js";
import * as liveLocations from "../../services/liveLocations.js";
import * as proofs from "../../services/proofs.js";
import * as digital from "../../services/digitalInvitation.js";

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  tokenMgr.getStoredUid.mockReturnValue("uid-stored");
  tokenMgr.peekIdToken.mockReturnValue("peek.token");
  createPoller.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// auth.js
// ════════════════════════════════════════════════════════════════════════════

describe("auth.signIn", () => {
  it("POSTs /auth/login with skipAuth and stores returned tokens", async () => {
    api.post.mockResolvedValueOnce({
      idToken: "idt", refreshToken: "rft", expiresIn: 3600,
      uid: "u1", role: "admin", username: "admin", displayName: "A",
    });
    const out = await auth.signIn("admin", "pw");
    expect(api.post).toHaveBeenCalledWith(
      "/auth/login",
      { username: "admin", password: "pw" },
      { skipAuth: true },
    );
    expect(tokenMgr.storeTokens).toHaveBeenCalledWith({
      idToken: "idt", refreshToken: "rft", expiresIn: 3600, uid: "u1",
    });
    expect(out).toMatchObject({ uid: "u1", role: "admin", username: "admin" });
  });
});

describe("auth.signOutNow", () => {
  it("POSTs /auth/logout and clears tokens", async () => {
    api.post.mockResolvedValueOnce({});
    await auth.signOutNow();
    expect(api.post).toHaveBeenCalledWith("/auth/logout", {});
    expect(tokenMgr.clearTokens).toHaveBeenCalled();
  });

  it("clears tokens even if logout call fails", async () => {
    api.post.mockRejectedValueOnce(new Error("network down"));
    await auth.signOutNow();
    expect(tokenMgr.clearTokens).toHaveBeenCalled();
  });
});

describe("auth.fetchProfile", () => {
  it("GETs /auth/me", async () => {
    api.get.mockResolvedValueOnce({ uid: "u" });
    const out = await auth.fetchProfile();
    expect(api.get).toHaveBeenCalledWith("/auth/me");
    expect(out).toEqual({ uid: "u" });
  });

  it("returns null on error", async () => {
    api.get.mockRejectedValueOnce(new Error("x"));
    expect(await auth.fetchProfile()).toBeNull();
  });
});

describe("auth.forceRefreshToken", () => {
  it("delegates to tokenManager.refreshIdToken", async () => {
    const t = await auth.forceRefreshToken();
    expect(tokenMgr.refreshIdToken).toHaveBeenCalled();
    expect(t).toBe("fresh.token");
  });

  it("returns null on refresh failure", async () => {
    tokenMgr.refreshIdToken.mockRejectedValueOnce(new Error("nope"));
    expect(await auth.forceRefreshToken()).toBeNull();
  });
});

describe("auth.sendPasswordResetCode", () => {
  it("POSTs /auth/send-otp with phone + recaptcha token (public)", async () => {
    api.post.mockResolvedValueOnce({ sessionInfo: "sess123" });
    await auth.sendPasswordResetCode("+972500000001", "containerId", "rcap-token");
    expect(api.post).toHaveBeenCalledWith(
      "/auth/send-otp",
      { phoneE164: "+972500000001", recaptchaToken: "rcap-token" },
      { skipAuth: true },
    );
  });
});

describe("auth.confirmPasswordResetCode", () => {
  it("POSTs /auth/verify-otp and stores tokens", async () => {
    api.post.mockResolvedValueOnce({ idToken: "i", refreshToken: "r", expiresIn: 1800 });
    await auth.confirmPasswordResetCode({ sessionInfo: "s" }, "123456");
    expect(api.post).toHaveBeenCalledWith(
      "/auth/verify-otp",
      { sessionInfo: "s", code: "123456" },
      { skipAuth: true },
    );
    expect(tokenMgr.storeTokens).toHaveBeenCalled();
  });
});

describe("auth.callResetPassword", () => {
  it("POSTs /auth/reset-password with the new password", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await auth.callResetPassword("NewPass1");
    expect(api.post).toHaveBeenCalledWith("/auth/reset-password", { newPassword: "NewPass1" });
  });
});

describe("auth.subscribeAuth", () => {
  it("fires cb(null) immediately when no stored uid", async () => {
    tokenMgr.getStoredUid.mockReturnValueOnce(null);
    const cb = vi.fn();
    auth.subscribeAuth(cb);
    await new Promise((r) => queueMicrotask(r));
    expect(cb).toHaveBeenCalledWith(null);
  });

  it("polls /auth/me when a uid is stored and reshapes the response", async () => {
    api.get.mockResolvedValueOnce({
      uid: "u", role: "groom", username: "g",
      displayName: "G", phoneE164: "+1", claims: { role: "groom" },
    });
    const cb = vi.fn();
    auth.subscribeAuth(cb);
    await new Promise((r) => setTimeout(r, 5));
    expect(api.get).toHaveBeenCalledWith("/auth/me");
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      uid: "u", role: "groom", username: "g",
    }));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// guests.js
// ════════════════════════════════════════════════════════════════════════════

describe("guests", () => {
  it("addGuest POSTs /guests/:groomUid and returns id", async () => {
    api.post.mockResolvedValueOnce({ id: "g123" });
    const out = await guests.addGuest("groom1", { name: "n", phone: "+1" });
    expect(api.post).toHaveBeenCalledWith("/guests/groom1", { name: "n", phone: "+1" });
    expect(out).toBe("g123");
  });

  it("updateGuest PATCHes /guests/:groomUid/:id", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await guests.updateGuest("g1", "id1", { city: "Haifa" });
    expect(api.patch).toHaveBeenCalledWith("/guests/g1/id1", { city: "Haifa" });
  });

  it("removeGuest DELETEs /guests/:groomUid/:id", async () => {
    api.delete.mockResolvedValueOnce(null);
    await guests.removeGuest("g1", "id1");
    expect(api.delete).toHaveBeenCalledWith("/guests/g1/id1");
  });

  it("subscribeAllGuests creates a poller against /guests", async () => {
    api.get.mockResolvedValue([]);
    const cb = vi.fn();
    guests.subscribeAllGuests(cb);
    expect(createPoller).toHaveBeenCalled();
    const fetchFn = createPoller.mock.calls[0][0];
    await fetchFn();
    expect(api.get).toHaveBeenCalledWith("/guests");
  });

  it("subscribeGuestsForGroom fires cb([]) synchronously without a groomUid", async () => {
    const cb = vi.fn();
    guests.subscribeGuestsForGroom("", cb);
    await new Promise((r) => queueMicrotask(r));
    expect(cb).toHaveBeenCalledWith([]);
    expect(createPoller).not.toHaveBeenCalled();
  });

  it("subscribeGuestsForGroom polls /guests/:groomUid", async () => {
    api.get.mockResolvedValue([{ id: 1 }]);
    const cb = vi.fn();
    guests.subscribeGuestsForGroom("g1", cb);
    expect(createPoller).toHaveBeenCalled();
    const fetchFn = createPoller.mock.calls[0][0];
    await fetchFn();
    expect(api.get).toHaveBeenCalledWith("/guests/g1");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// users.js
// ════════════════════════════════════════════════════════════════════════════

describe("users", () => {
  it("createPortalUser POSTs /users", async () => {
    api.post.mockResolvedValueOnce({ uid: "new" });
    await users.createPortalUser({ username: "x", password: "P1", role: "groom" });
    expect(api.post).toHaveBeenCalledWith("/users", {
      username: "x", password: "P1", role: "groom",
    });
  });

  it("deletePortalUser DELETEs /users/:uid", async () => {
    api.delete.mockResolvedValueOnce(null);
    await users.deletePortalUser("u1");
    expect(api.delete).toHaveBeenCalledWith("/users/u1");
  });

  it("updatePortalUser strips uid and PUTs the rest", async () => {
    api.put.mockResolvedValueOnce({ ok: true });
    await users.updatePortalUser({ uid: "u2", username: "new", role: "driver" });
    expect(api.put).toHaveBeenCalledWith("/users/u2", { username: "new", role: "driver" });
  });

  it("adminSetPassword PUTs /users/:uid/password", async () => {
    api.put.mockResolvedValueOnce({ ok: true });
    await users.adminSetPassword("u3", "NewPass1");
    expect(api.put).toHaveBeenCalledWith("/users/u3/password", { newPassword: "NewPass1" });
  });

  it("setAdminClaim POSTs /users/:uid/admin-claim", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await users.setAdminClaim("u4", true);
    expect(api.post).toHaveBeenCalledWith("/users/u4/admin-claim", { isAdmin: true });
  });

  it("patchUserInRTDB PATCHes /users/:uid", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await users.patchUserInRTDB("u5", { displayName: "X" });
    expect(api.patch).toHaveBeenCalledWith("/users/u5", { displayName: "X" });
  });

  it("upsertGroomProfile PUTs /users/groom-profiles/:uid", async () => {
    api.put.mockResolvedValueOnce({ ok: true });
    await users.upsertGroomProfile("u6", { username: "x", displayName: "X" });
    expect(api.put).toHaveBeenCalledWith("/users/groom-profiles/u6", {
      username: "x", displayName: "X",
    });
  });

  it("upsertGroomProfile omits displayName when falsy", async () => {
    api.put.mockResolvedValueOnce({ ok: true });
    await users.upsertGroomProfile("u6", { username: "x" });
    expect(api.put).toHaveBeenCalledWith("/users/groom-profiles/u6", { username: "x" });
  });

  it("removeGroomProfile DELETEs /users/groom-profiles/:uid", async () => {
    api.delete.mockResolvedValueOnce(null);
    await users.removeGroomProfile("u7");
    expect(api.delete).toHaveBeenCalledWith("/users/groom-profiles/u7");
  });

  it("subscribeUsers maps uid→id alias on each row", async () => {
    api.get.mockResolvedValue([{ uid: "u8", username: "x" }]);
    const cb = vi.fn();
    users.subscribeUsers(cb);
    const fetchFn = createPoller.mock.calls[0][0];
    const mappedCb = createPoller.mock.calls[0][1];
    mappedCb(await fetchFn());
    expect(cb).toHaveBeenCalledWith([{ uid: "u8", username: "x", id: "u8" }]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// confirmations.js
// ════════════════════════════════════════════════════════════════════════════

describe("confirmations", () => {
  it("submitConfirmation POSTs /confirmations with skipAuth (public)", async () => {
    api.post.mockResolvedValueOnce({ id: "c1" });
    const payload = { groomUsername: "g", submittedName: "n", submittedPhone: "+1" };
    await confirmations.submitConfirmation(payload);
    expect(api.post).toHaveBeenCalledWith("/confirmations", payload, { skipAuth: true });
  });

  it("updateConfirmation PATCHes /confirmations/:id", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await confirmations.updateConfirmation("c1", { submittedName: "x" });
    expect(api.patch).toHaveBeenCalledWith("/confirmations/c1", { submittedName: "x" });
  });

  it("attachConfirmationLocationToGuest POSTs /confirmations/attach-location", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await confirmations.attachConfirmationLocationToGuest({ confirmationId: "c", guestId: "g" });
    expect(api.post).toHaveBeenCalledWith("/confirmations/attach-location", {
      confirmationId: "c", guestId: "g",
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// adminSettings.js
// ════════════════════════════════════════════════════════════════════════════

describe("adminSettings", () => {
  it("saveSettings PATCHes /settings", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await adminSettings.saveSettings({ messageBody: "x" });
    expect(api.patch).toHaveBeenCalledWith("/settings", { messageBody: "x" });
  });

  it("subscribeSettings polls /settings via createPoller", async () => {
    api.get.mockResolvedValue({ messageBody: "x" });
    adminSettings.subscribeSettings(vi.fn());
    expect(createPoller).toHaveBeenCalled();
    const fetchFn = createPoller.mock.calls[0][0];
    await fetchFn();
    expect(api.get).toHaveBeenCalledWith("/settings");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// assignments.js
// ════════════════════════════════════════════════════════════════════════════

describe("assignments", () => {
  it("assignDriverToGroom POSTs /assignments with username", async () => {
    api.post.mockResolvedValueOnce({ groomUid: "g1" });
    await assignments.assignDriverToGroom("groomname");
    expect(api.post).toHaveBeenCalledWith("/assignments", { groomUsername: "groomname" });
  });

  it("subscribeAssignmentsFor fires cb({}) synchronously without a driverUid", async () => {
    const cb = vi.fn();
    assignments.subscribeAssignmentsFor("", cb);
    await new Promise((r) => queueMicrotask(r));
    expect(cb).toHaveBeenCalledWith({});
  });

  it("subscribeAssignmentsFor polls /assignments/:driverUid", async () => {
    api.get.mockResolvedValue({ g1: true });
    assignments.subscribeAssignmentsFor("d1", vi.fn());
    const fetchFn = createPoller.mock.calls[0][0];
    await fetchFn();
    expect(api.get).toHaveBeenCalledWith("/assignments/d1");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// invites.js
// ════════════════════════════════════════════════════════════════════════════

describe("invites", () => {
  it("createGuestInvite POSTs /invites", async () => {
    api.post.mockResolvedValueOnce({ token: "t", expiresAt: 1 });
    await invites.createGuestInvite({ groomUid: "g", guestId: "x" });
    expect(api.post).toHaveBeenCalledWith("/invites", { groomUid: "g", guestId: "x" });
  });

  it("submitGuestInvite POSTs /invites/submit with skipAuth", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await invites.submitGuestInvite({ token: "t", area: "x" });
    expect(api.post).toHaveBeenCalledWith(
      "/invites/submit",
      { token: "t", area: "x" },
      { skipAuth: true },
    );
  });

  it("createDigitalGuestInvite POSTs /invites/digital", async () => {
    api.post.mockResolvedValueOnce({ token: "td" });
    await invites.createDigitalGuestInvite({ groomUid: "g", guestId: "x" });
    expect(api.post).toHaveBeenCalledWith("/invites/digital", { groomUid: "g", guestId: "x" });
  });

  it("submitDigitalGuestInvite POSTs /invites/digital/submit with skipAuth", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await invites.submitDigitalGuestInvite({ token: "t", rsvp: "attending" });
    expect(api.post).toHaveBeenCalledWith(
      "/invites/digital/submit",
      { token: "t", rsvp: "attending" },
      { skipAuth: true },
    );
  });

  it("subscribeInviteToken fires cb(null) synchronously when token is empty", async () => {
    const cb = vi.fn();
    invites.subscribeInviteToken("", cb);
    await new Promise((r) => queueMicrotask(r));
    expect(cb).toHaveBeenCalledWith(null);
  });

  it("subscribeInviteToken polls /invites/token/:token (public)", async () => {
    api.get.mockResolvedValue({ token: "t" });
    invites.subscribeInviteToken("t", vi.fn());
    const fetchFn = createPoller.mock.calls[0][0];
    await fetchFn();
    expect(api.get).toHaveBeenCalledWith("/invites/token/t", { skipAuth: true });
  });

  it("subscribeInviteToken returns null on 404 instead of propagating", async () => {
    const err = new Error("not_found"); err.status = 404;
    api.get.mockRejectedValueOnce(err);
    invites.subscribeInviteToken("t", vi.fn());
    const fetchFn = createPoller.mock.calls[0][0];
    expect(await fetchFn()).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// liveLocations.js
// ════════════════════════════════════════════════════════════════════════════

describe("liveLocations", () => {
  it("publishMyFix POSTs /live-locations with shareWith list", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await liveLocations.publishMyFix(
      "ignored", "Driver", { lat: 1, lng: 2, accuracy: 3 }, ["g1", "g2"],
    );
    expect(api.post).toHaveBeenCalledWith("/live-locations", {
      fix: { lat: 1, lng: 2, accuracy: 3 },
      driverDisplayName: "Driver",
      shareWith: ["g1", "g2"],
    });
  });

  it("publishMyFix is a no-op when shareWith is empty", async () => {
    await liveLocations.publishMyFix("ignored", "D", { lat: 1, lng: 2 }, []);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("clearMyLocation POSTs /live-locations/clear", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await liveLocations.clearMyLocation("d", ["g1"]);
    expect(api.post).toHaveBeenCalledWith("/live-locations/clear", { formerShareWith: ["g1"] });
  });

  it("clearMyLocation is a no-op with empty list", async () => {
    await liveLocations.clearMyLocation("d", []);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("subscribeDriversForGroom fires cb({}) synchronously without a groomUid", async () => {
    const cb = vi.fn();
    liveLocations.subscribeDriversForGroom("", cb);
    await new Promise((r) => queueMicrotask(r));
    expect(cb).toHaveBeenCalledWith({});
  });

  it("subscribeDriversForGroom returns no-op when no token is stored", async () => {
    tokenMgr.peekIdToken.mockReturnValueOnce(null);
    const cb = vi.fn();
    const stop = liveLocations.subscribeDriversForGroom("g1", cb);
    await new Promise((r) => queueMicrotask(r));
    expect(cb).toHaveBeenCalledWith({});
    expect(typeof stop).toBe("function");
  });

  it("subscribeDriversForGroom opens an EventSource with ?token=...", async () => {
    const evts = [];
    class FakeEventSource {
      constructor(url) { this.url = url; evts.push(this); }
      close() { this.closed = true; }
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    const cb = vi.fn();
    const stop = liveLocations.subscribeDriversForGroom("g1", cb);
    expect(evts.length).toBe(1);
    expect(evts[0].url).toContain("/live-locations/g1/stream?token=peek.token");
    // Simulate a server message.
    evts[0].onmessage({ data: JSON.stringify({ driverA: { lat: 1, lng: 2 } }) });
    expect(cb).toHaveBeenCalledWith({ driverA: { lat: 1, lng: 2 } });
    stop();
    expect(evts[0].closed).toBe(true);
    vi.unstubAllGlobals();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// proofs.js
// ════════════════════════════════════════════════════════════════════════════

describe("proofs", () => {
  it("uploadProofBlob uploads multipart and returns server-side path", async () => {
    api.upload.mockResolvedValueOnce({ path: "proofs/g/x.jpg" });
    const blob = new Blob(["data"], { type: "image/jpeg" });
    const out = await proofs.uploadProofBlob("g1", "guest1", blob);
    expect(api.upload).toHaveBeenCalledTimes(1);
    const [url, fd] = api.upload.mock.calls[0];
    expect(url).toBe("/proofs/upload");
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get("groomUid")).toBe("g1");
    expect(fd.get("guestId")).toBe("guest1");
    expect(out).toBe("proofs/g/x.jpg");
  });

  it("uploadProofBlob returns null when response is missing path", async () => {
    api.upload.mockResolvedValueOnce({});
    const blob = new Blob(["x"]);
    expect(await proofs.uploadProofBlob("g", "x", blob)).toBeNull();
  });

  it("proofDownloadUrl GETs /proofs/url?path= with encoded path", async () => {
    api.get.mockResolvedValueOnce({ url: "https://signed/" });
    const out = await proofs.proofDownloadUrl("proofs/g 1/x.jpg");
    expect(api.get).toHaveBeenCalledWith("/proofs/url?path=proofs%2Fg%201%2Fx.jpg");
    expect(out).toBe("https://signed/");
  });

  it("proofDownloadUrl returns null for empty path", async () => {
    expect(await proofs.proofDownloadUrl("")).toBeNull();
    expect(await proofs.proofDownloadUrl(null)).toBeNull();
  });

  it("dataUrlToBlob converts a data URL to a Blob of the right MIME", () => {
    // base64 for "hi"
    const dataUrl = "data:image/png;base64,aGk=";
    const blob = proofs.dataUrlToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// digitalInvitation.js
// ════════════════════════════════════════════════════════════════════════════

describe("digitalInvitation — guests", () => {
  it("addDigitalGuest POSTs /digital/:uid/guests", async () => {
    api.post.mockResolvedValueOnce({ id: "dg1" });
    const out = await digital.addDigitalGuest("g1", { name: "n", phone: "+1" });
    expect(api.post).toHaveBeenCalledWith("/digital/g1/guests", { name: "n", phone: "+1" });
    expect(out).toBe("dg1");
  });

  it("addDigitalGuest includes trimmed ranks array when present", async () => {
    api.post.mockResolvedValueOnce({ id: "dg2" });
    await digital.addDigitalGuest("g1", { name: "n", phone: "+1", ranks: [" VIP ", "Friend"] });
    expect(api.post).toHaveBeenCalledWith("/digital/g1/guests", {
      name: "n", phone: "+1", ranks: ["VIP", "Friend"],
    });
  });

  it("addDigitalGuest promotes legacy single rank string to ranks[]", async () => {
    api.post.mockResolvedValueOnce({ id: "dg2b" });
    await digital.addDigitalGuest("g1", { name: "n", phone: "+1", rank: " VIP " });
    expect(api.post).toHaveBeenCalledWith("/digital/g1/guests", {
      name: "n", phone: "+1", ranks: ["VIP"],
    });
  });

  it("addDigitalGuest falls back to stored uid", async () => {
    api.post.mockResolvedValueOnce({ id: "dg3" });
    await digital.addDigitalGuest(null, { name: "n", phone: "+1" });
    expect(api.post).toHaveBeenCalledWith("/digital/uid-stored/guests", { name: "n", phone: "+1" });
  });

  it("addDigitalGuest throws when no uid available", async () => {
    tokenMgr.getStoredUid.mockReturnValueOnce(null);
    await expect(digital.addDigitalGuest(null, { name: "n", phone: "+1" }))
      .rejects.toThrow(/Not authenticated/);
  });

  it("updateDigitalGuest PATCHes /digital/:uid/guests/:id", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await digital.updateDigitalGuest("g1", "id1", { rsvp: "attending" });
    expect(api.patch).toHaveBeenCalledWith("/digital/g1/guests/id1", { rsvp: "attending" });
  });

  it("removeDigitalGuest DELETEs /digital/:uid/guests/:id", async () => {
    api.delete.mockResolvedValueOnce(null);
    await digital.removeDigitalGuest("g1", "id1");
    expect(api.delete).toHaveBeenCalledWith("/digital/g1/guests/id1");
  });
});

describe("digitalInvitation — media", () => {
  it("addInvitationMedia uploads multipart", async () => {
    api.upload.mockResolvedValueOnce({ url: "u", kind: "image" });
    const file = new File(["x"], "bg.png", { type: "image/png" });
    await digital.addInvitationMedia("g1", file);
    const [url, fd] = api.upload.mock.calls[0];
    expect(url).toBe("/digital/g1/media/upload");
    expect(fd.get("file")).toBeInstanceOf(File);
  });

  it("removeInvitationMedia POSTs delete-item with storagePath", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await digital.removeInvitationMedia("g1", { storagePath: "path/x.png" });
    expect(api.post).toHaveBeenCalledWith("/digital/g1/media/delete-item", {
      storagePath: "path/x.png",
    });
  });

  it("removeInvitationMedia no-ops when storagePath missing", async () => {
    await digital.removeInvitationMedia("g1", {});
    expect(api.post).not.toHaveBeenCalled();
  });

  it("addInvitationMedia tags the upload with target=hero when requested", async () => {
    api.upload.mockResolvedValueOnce({ url: "u", kind: "image" });
    const file = new File(["x"], "feature.png", { type: "image/png" });
    await digital.addInvitationMedia("g1", file, { target: "hero" });
    const [url, fd] = api.upload.mock.calls[0];
    expect(url).toBe("/digital/g1/media/upload");
    expect(fd.get("file")).toBeInstanceOf(File);
    expect(fd.get("target")).toBe("hero");
  });

  it("removeInvitationMedia includes target=hero in the delete body when requested", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await digital.removeInvitationMedia("g1", { storagePath: "path/x.png" }, { target: "hero" });
    expect(api.post).toHaveBeenCalledWith("/digital/g1/media/delete-item", {
      storagePath: "path/x.png",
      target: "hero",
    });
  });

  it("removeDigitalMedia DELETEs /digital/:uid/media", async () => {
    api.delete.mockResolvedValueOnce({ ok: true });
    await digital.removeDigitalMedia("g1");
    expect(api.delete).toHaveBeenCalledWith("/digital/g1/media");
  });

  it("setWeddingDate PATCHes media/settings", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await digital.setWeddingDate("g1", 1234567);
    expect(api.patch).toHaveBeenCalledWith("/digital/g1/media/settings", {
      weddingDate: 1234567,
    });
  });

  it("setPhotographerPublished PATCHes media/settings with boolean", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await digital.setPhotographerPublished("g1", "truthy");
    expect(api.patch).toHaveBeenCalledWith("/digital/g1/media/settings", {
      photographerPublished: true,
    });
  });

  it("setGuestRanks PATCHes with safe array fallback", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await digital.setGuestRanks("g1", "not-an-array");
    expect(api.patch).toHaveBeenCalledWith("/digital/g1/media/settings", {
      guestRanks: [],
    });
  });

  it("getDigitalInvitationPublic GETs /digital/:uid/public unauthenticated", async () => {
    api.get.mockResolvedValueOnce({ name: "doc" });
    const out = await digital.getDigitalInvitationPublic("g1");
    expect(api.get).toHaveBeenCalledWith("/digital/g1/public", { skipAuth: true });
    expect(out).toEqual({ name: "doc" });
  });

  it("getDigitalInvitationPublic returns null on failure", async () => {
    api.get.mockRejectedValueOnce(new Error("nope"));
    expect(await digital.getDigitalInvitationPublic("g1")).toBeNull();
  });

  it("getDigitalInvitationPublic returns null for missing uid", async () => {
    expect(await digital.getDigitalInvitationPublic("")).toBeNull();
  });
});

describe("digitalInvitation — photographer", () => {
  it("uploadPhotographerFile uploads multipart", async () => {
    api.upload.mockResolvedValueOnce({ url: "u", id: "pf1", storagePath: "p/pf1" });
    const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
    const out = await digital.uploadPhotographerFile("g1", file);
    expect(api.upload).toHaveBeenCalledWith(
      "/digital/g1/photographer/upload",
      expect.any(FormData),
      undefined,
    );
    expect(out).toMatchObject({
      id: "pf1",
      url: "u",
      storagePath: "p/pf1",
      key: "pf1",
      name: "p.jpg",
      type: "image/jpeg",
    });
    expect(typeof out.uploadedAt).toBe("number");
  });

  it("uploadPhotographerFile forwards an abort signal", async () => {
    api.upload.mockResolvedValueOnce({ url: "u", id: "pf2" });
    const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
    const controller = new AbortController();
    await digital.uploadPhotographerFile("g1", file, { signal: controller.signal });
    expect(api.upload).toHaveBeenCalledWith(
      "/digital/g1/photographer/upload",
      expect.any(FormData),
      { signal: controller.signal },
    );
  });

  it("renamePhotographerFile PATCHes /digital/:uid/photographer/:fileId", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await digital.renamePhotographerFile("g1", "fid", "  New Name  ");
    expect(api.patch).toHaveBeenCalledWith(
      "/digital/g1/photographer/fid",
      { name: "New Name" },
    );
  });

  it("renamePhotographerFile rejects empty name", async () => {
    await expect(digital.renamePhotographerFile("g1", "fid", "   "))
      .rejects.toThrow(/Name/);
  });

  it("removePhotographerFile DELETEs /digital/:uid/photographer/:fileId", async () => {
    api.delete.mockResolvedValueOnce(null);
    await digital.removePhotographerFile("g1", "fid");
    expect(api.delete).toHaveBeenCalledWith("/digital/g1/photographer/fid");
  });

  it("fetchPublishedPhotographerFiles uses skipAuth and returns [] on failure", async () => {
    api.get.mockRejectedValueOnce(new Error("forbidden"));
    expect(await digital.fetchPublishedPhotographerFiles("g1")).toEqual([]);
  });

  it("auto-heal stubs return inert values", async () => {
    expect(await digital.listPhotographerFilesFromStorage()).toEqual([]);
    expect(await digital.getLatestDigitalMediaFromStorage()).toBeNull();
    expect(await digital.healPhotographerFiles()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// digitalInvitation.js — design approval state machine
// ════════════════════════════════════════════════════════════════════════════

describe("digital design approval", () => {
  it("patchDesignFields PATCHes /media/settings with the supplied subset", async () => {
    api.patch.mockResolvedValueOnce({ ok: true });
    await digital.patchDesignFields("g1", { themeColor: "rose", venue: "Hall" });
    expect(api.patch).toHaveBeenCalledWith("/digital/g1/media/settings", {
      themeColor: "rose",
      venue: "Hall",
    });
  });

  it("submitDesignForApproval POSTs /design/submit", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await digital.submitDesignForApproval("g1");
    expect(api.post).toHaveBeenCalledWith("/digital/g1/design/submit", {});
  });

  it("cancelDesignSubmission POSTs /design/cancel", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await digital.cancelDesignSubmission("g1");
    expect(api.post).toHaveBeenCalledWith("/digital/g1/design/cancel", {});
  });

  it("approveDigitalDesign POSTs /design/approve", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await digital.approveDigitalDesign("g1");
    expect(api.post).toHaveBeenCalledWith("/digital/g1/design/approve", {});
  });

  it("rejectDigitalDesign POSTs /design/reject with the note", async () => {
    api.post.mockResolvedValueOnce({ ok: true });
    await digital.rejectDigitalDesign("g1", "fix the venue");
    expect(api.post).toHaveBeenCalledWith("/digital/g1/design/reject", {
      note: "fix the venue",
    });
  });

  it("subscribeAdminDesignList polls /digital/design-list", async () => {
    api.get.mockResolvedValue([]);
    digital.subscribeAdminDesignList(vi.fn());
    const fetchFn = createPoller.mock.calls[createPoller.mock.calls.length - 1][0];
    await fetchFn();
    expect(api.get).toHaveBeenCalledWith("/digital/design-list");
  });
});
