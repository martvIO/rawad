// Tests for the admin Send-tab hook: sendInviteLink's manual-mode fallback
// payloads (server send failed / not_configured + popup blocked / popup opened),
// prepareResendFallback's token reuse vs re-mint (physical + digital sections,
// keyed off opts.digital — NOT adminMode), the noDesign no-link payload, and
// markManualSent's fire-and-forget stamping. Services are vi.mock'd; the real
// phone utils (buildWaLink / toIntlPhone) and URL builders run for real so the
// payload shapes are pinned end-to-end. t() echoes keys.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// vi.mock is hoisted above the ESM imports — mock the exact wrapper-module
// specifiers the hook imports (frontend/src/services/*.js re-export @dawa/core).
vi.mock("../../services/invites.js", () => ({
  createGuestInvite: vi.fn(),
  notifyDigitalGuest: vi.fn(),
  markInviteManualSent: vi.fn(),
}));
vi.mock("../../services/digitalInvitation.js", () => ({
  subscribeDigitalGuests: vi.fn(() => () => {}),
  createDigitalGuestInvite: vi.fn(),
}));

import {
  createGuestInvite, notifyDigitalGuest, markInviteManualSent,
} from "../../services/invites.js";
import { createDigitalGuestInvite } from "../../services/digitalInvitation.js";
import { usePortalSendInvites } from "../../hooks/portal/usePortalSendInvites.js";

const t = (k) => k;

const baseProps = (over = {}) => ({
  isAdmin: true,
  users: [],
  adminUsers: [],
  guests: [],
  adminMessageBody: "hello",
  adminFormLink: "",
  adminMode: "manual",
  adminDigitalBaseUrl: "",
  adminDigitalMessage: "dig-msg",
  t,
  lang: "ar",
  showToast: vi.fn(),
  ...over,
});

const setup = (over = {}) => {
  const props = baseProps(over);
  const { result } = renderHook(() => usePortalSendInvites(props));
  return { result, props };
};

// Minimal valid guest — phone parses via the REAL toIntlPhone (→ 972501234567).
const guest = (over = {}) => ({
  id: "g1",
  groomUid: "groom-1",
  name: "أحمد",
  phone: "0501234567",
  ...over,
});

const DAY_MS = 24 * 60 * 60 * 1000;

let openSpy;

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom's window.open is a no-op stub — spy so we can steer popup outcomes.
  openSpy = vi.spyOn(window, "open").mockReturnValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePortalSendInvites — sendInviteLink (manual mode)", () => {
  it("returns the fallback payload (and no needsFallback leak) when the server send fails", async () => {
    const token = "a".repeat(32);
    createGuestInvite.mockResolvedValue({ token, send: { ok: false, error: "http_400" } });
    const { result, props } = setup();

    const res = await result.current.sendInviteLink(guest());

    expect(createGuestInvite).toHaveBeenCalledWith({
      groomUid: "groom-1", guestId: "g1", deliver: "whatsapp", messageBody: "hello",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("http_400");
    expect(res.fallback).toEqual({
      guestId: "g1",
      name: "أحمد",
      phone: "0501234567",
      message: "hello",
      url: expect.stringMatching(new RegExp(`/invite/${token}$`)),
      error: "http_400",
      type: "physical",
      groomUid: "groom-1",
    });
    // withFallback must consume the internal needsFallback key, not leak it.
    expect("needsFallback" in res).toBe(false);
    // A hard send error never opens a tab and never toasts — the modal is the feedback.
    expect(openSpy).not.toHaveBeenCalled();
    expect(props.showToast).not.toHaveBeenCalled();
  });

  it("not_configured + popup blocked → error popup_blocked with a fallback payload", async () => {
    const token = "a".repeat(32);
    createGuestInvite.mockResolvedValue({ token, send: { ok: false, error: "not_configured" } });
    openSpy.mockReturnValue(null); // popup blocker
    const { result } = setup();

    const res = await result.current.sendInviteLink(guest());

    // The wa.me tab was attempted with the real buildWaLink URL.
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\/972501234567\?text=/);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("popup_blocked");
    expect(res.fallback).toEqual(expect.objectContaining({
      guestId: "g1",
      phone: "0501234567",
      message: "hello",
      url: expect.stringMatching(new RegExp(`/invite/${token}$`)),
      error: "popup_blocked",
      type: "physical",
      groomUid: "groom-1",
    }));
    expect("needsFallback" in res).toBe(false);
  });

  it("not_configured + popup opened → { ok: true, fallback: true } with NO payload object", async () => {
    createGuestInvite.mockResolvedValue({
      token: "a".repeat(32), send: { ok: false, error: "not_configured" },
    });
    openSpy.mockReturnValue({}); // tab opened fine
    const { result } = setup();

    const res = await result.current.sendInviteLink(guest());

    // fallback is the boolean marker, not the modal payload.
    expect(res).toEqual({ ok: true, fallback: true });
  });
});

describe("usePortalSendInvites — prepareResendFallback", () => {
  it("reuses a FRESH token without re-minting (physical)", async () => {
    const { result } = setup();
    const g = guest({ inviteLinkToken: "freshtok123", inviteLinkSentAt: Date.now() - 1000 });

    const fb = await result.current.prepareResendFallback(g);

    expect(createGuestInvite).not.toHaveBeenCalled();
    expect(createDigitalGuestInvite).not.toHaveBeenCalled();
    expect(fb).toEqual({
      guestId: "g1",
      name: "أحمد",
      phone: "0501234567",
      message: "hello",
      type: "physical",
      groomUid: "groom-1",
      error: "send_failed",
      url: expect.stringMatching(/\/invite\/freshtok123$/),
    });
  });

  it("re-mints via createGuestInvite (mint-only, NO deliver key) when the token is expired", async () => {
    createGuestInvite.mockResolvedValue({ token: "mintedtok456" });
    const { result } = setup();
    const g = guest({
      inviteLinkToken: "oldtok",
      inviteLinkSentAt: Date.now() - 91 * DAY_MS, // past the 90d TTL
    });

    const fb = await result.current.prepareResendFallback(g);

    expect(createGuestInvite).toHaveBeenCalledTimes(1);
    expect(createGuestInvite).toHaveBeenCalledWith({ groomUid: "groom-1", guestId: "g1" });
    expect("deliver" in createGuestInvite.mock.calls[0][0]).toBe(false);
    expect(fb.url).toMatch(/\/invite\/mintedtok456$/);
    expect(fb.type).toBe("physical");
  });

  it("digital section mints via createDigitalGuestInvite and builds a /d/ url", async () => {
    createDigitalGuestInvite.mockResolvedValue({ token: "digtok789" });
    const { result } = setup();
    const g = guest(); // no stored token → stale → mint

    const fb = await result.current.prepareResendFallback(g, { digital: true });

    expect(createDigitalGuestInvite).toHaveBeenCalledTimes(1);
    expect(createDigitalGuestInvite).toHaveBeenCalledWith({ groomUid: "groom-1", guestId: "g1" });
    expect(createGuestInvite).not.toHaveBeenCalled();
    expect(fb.url).toMatch(/\/d\//);
    expect(fb.url).toMatch(/digtok789$/);
    expect(fb.type).toBe("digital");
    expect(fb.message).toBe("dig-msg"); // adminDigitalMessage, no customMessage
  });

  it("digital + noDesign returns url:\"\" and does NOT mint", async () => {
    const { result } = setup();

    const fb = await result.current.prepareResendFallback(guest(), { digital: true, noDesign: true });

    expect(createDigitalGuestInvite).not.toHaveBeenCalled();
    expect(createGuestInvite).not.toHaveBeenCalled();
    expect(fb.url).toBe("");
    expect(fb.type).toBe("digital");
    expect(fb.message).toBe("dig-msg");
  });

  it("is keyed off opts.digital ONLY — adminMode digital still yields a physical url", async () => {
    // Regression for the token-type-mismatch bug: a physical row's stored token
    // must never be wrapped in a /d/ digital URL just because adminMode flipped.
    const { result } = setup({ adminMode: "digital" });
    const g = guest({ inviteLinkToken: "phystok", inviteLinkSentAt: Date.now() - 5000 });

    const fb = await result.current.prepareResendFallback(g, {});

    expect(fb.type).toBe("physical");
    expect(fb.url).toMatch(/\/invite\/phystok$/);
    expect(fb.url).not.toMatch(/\/d\//);
    expect(fb.message).toBe("hello"); // adminMessageBody, not the digital message
    expect(createGuestInvite).not.toHaveBeenCalled();
    expect(createDigitalGuestInvite).not.toHaveBeenCalled();
  });
});

describe("usePortalSendInvites — markManualSent", () => {
  it("stamps via markInviteManualSent with { type, groomUid, guestId }", () => {
    markInviteManualSent.mockResolvedValue({});
    const { result } = setup();

    result.current.markManualSent({
      type: "physical", groomUid: "groom-1", guestId: "g1",
      name: "أحمد", url: "x", // extra payload fields must NOT be forwarded
    });

    expect(markInviteManualSent).toHaveBeenCalledTimes(1);
    expect(markInviteManualSent).toHaveBeenCalledWith({
      type: "physical", groomUid: "groom-1", guestId: "g1",
    });
  });

  it("swallows a rejection (logErr, no throw)", async () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    markInviteManualSent.mockRejectedValueOnce(new Error("boom"));
    const { result } = setup();

    expect(() =>
      result.current.markManualSent({ type: "digital", groomUid: "groom-1", guestId: "g1" }),
    ).not.toThrow();

    // Fire-and-forget: the .catch routes the failure into logErr.
    await vi.waitFor(() => {
      expect(consoleErr).toHaveBeenCalledWith(
        "[dawa]", "markInviteManualSent", expect.anything(), "boom", expect.any(Error),
      );
    });
  });

  it("does nothing when the fallback lacks groomUid/guestId", () => {
    const { result } = setup();
    result.current.markManualSent({ type: "physical" });
    expect(markInviteManualSent).not.toHaveBeenCalled();
  });
});

// notifyDigitalGuest is imported by the hook (no-design SEND path) — referenced
// here so the mock shape stays in sync if the hook's imports change.
void notifyDigitalGuest;
