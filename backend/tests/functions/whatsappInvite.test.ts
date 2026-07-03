// Unit tests for the WhatsApp invite-delivery layer (whatsappInvite.ts): link
// building, the template-vs-text delivery decision (driven by an injected config),
// the send-component builder, and webhook status extraction/progression. fetch is
// mocked; config is passed in (resolveWhatsAppConfig) so no DB is touched.
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  inviteLocale,
  inviteLink,
  inviteSlot,
  buildInviteSendComponents,
  deliverInvite,
  notifyGuestText,
  recordManualSent,
  extractStatusUpdates,
  isStatusProgression,
} from "../../functions/src/whatsappInvite";
import { resolveWhatsAppConfig } from "../../functions/src/whatsappConfig";

afterEach(() => vi.restoreAllMocks());

const CREDS_ENV = { WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_ID: "999" } as NodeJS.ProcessEnv;
const cfgConfigured = (db = {}) => resolveWhatsAppConfig(db, CREDS_ENV);
const cfgUnconfigured = () => resolveWhatsAppConfig({}, {} as NodeJS.ProcessEnv);

function mockFetchOk(id = "wamid.X") {
  return vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [{ id }] }),
  } as never);
}

describe("inviteLocale", () => {
  it("defaults to Arabic, passes Hebrew through", () => {
    expect(inviteLocale(undefined)).toBe("ar");
    expect(inviteLocale("en")).toBe("ar");
    expect(inviteLocale("he")).toBe("he");
  });
});

describe("inviteLink + inviteSlot", () => {
  it("builds physical /invite and digital /d links", () => {
    expect(inviteLink("physical", "sami", "abc")).toBe("https://dawa-aa793.web.app/invite/abc");
    expect(inviteLink("digital", "sami", "abc")).toBe("https://dawa-aa793.web.app/d/sami/abc");
  });
  it("maps (type, locale) → slot key", () => {
    expect(inviteSlot("digital", "ar")).toBe("digital_ar");
    expect(inviteSlot("physical", "he")).toBe("physical_he");
  });
});

describe("buildInviteSendComponents", () => {
  it("digital suffix = groomUsername/token; physical suffix = token", () => {
    const d = buildInviteSendComponents({ guestName: "Ali", type: "digital", groomUsername: "sami", token: "t1" }) as any[];
    expect(d[0]).toEqual({ type: "body", parameters: [{ type: "text", text: "Ali" }] });
    expect(d[1].parameters[0].text).toBe("sami/t1");
    const p = buildInviteSendComponents({ guestName: "", type: "physical", groomUsername: "sami", token: "t2" }) as any[];
    expect(p[0].parameters[0].text).toBe("—"); // empty name → placeholder
    expect(p[1].parameters[0].text).toBe("t2");
  });
});

describe("deliverInvite", () => {
  it("no-ops (not_configured) when config has no token, never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never);
    const r = await deliverInvite(
      { type: "digital", locale: "ar", phone: "0544642743", guestName: "x", groomUsername: "sami", token: "abc" },
      cfgUnconfigured(),
    );
    expect(r).toEqual({ ok: false, error: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no-ops when auto-send is disabled even though creds exist", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never);
    const r = await deliverInvite(
      { type: "digital", locale: "ar", phone: "0544642743", guestName: "x", groomUsername: "sami", token: "abc" },
      cfgConfigured({ waAutoSendEnabled: false }),
    );
    expect(r).toEqual({ ok: false, error: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an unusable phone", async () => {
    const r = await deliverInvite(
      { type: "digital", locale: "ar", phone: "", guestName: "x", groomUsername: "sami", token: "abc" },
      cfgConfigured(),
    );
    expect(r).toEqual({ ok: false, error: "invalid_phone" });
  });

  it("TEMPLATE path when the slot has a template name: name var + URL suffix, intl phone", async () => {
    const fetchSpy = mockFetchOk("wamid.T");
    const r = await deliverInvite(
      { type: "digital", locale: "ar", phone: "0544642743", guestName: "أحمد", groomUsername: "sami", token: "abc123", messageBody: "ignored" },
      cfgConfigured({ waTemplateDigitalAr: "dawa_digital_ar" }),
    );
    expect(r).toEqual({ ok: true, id: "wamid.T" });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe("template");
    expect(body.to).toBe("972544642743");
    expect(body.template.name).toBe("dawa_digital_ar");
    expect(body.template.language).toEqual({ code: "ar" });
    expect(body.template.components[1].parameters[0].text).toBe("sami/abc123");
  });

  it("TEXT fallback when the slot has no template: body (or admin fallback) + link", async () => {
    const fetchSpy = mockFetchOk("wamid.X");
    const r = await deliverInvite(
      { type: "physical", locale: "ar", phone: "0544642743", guestName: "x", groomUsername: "sami", token: "abc", messageBody: "مرحبا أحمد" },
      cfgConfigured(),
    );
    expect(r).toEqual({ ok: true, id: "wamid.X" });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe("text");
    expect(body.text.body).toBe("مرحبا أحمد\n\nhttps://dawa-aa793.web.app/invite/abc");
  });

  it("TEXT fallback uses the admin's default fallback text when no message body", async () => {
    const fetchSpy = mockFetchOk();
    await deliverInvite(
      { type: "digital", locale: "he", phone: "0544642743", guestName: "x", groomUsername: "sami", token: "abc" },
      cfgConfigured({ waFallbackTextHe: "שלום" }),
    );
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text.body).toBe("שלום\n\nhttps://dawa-aa793.web.app/d/sami/abc");
  });
});

describe("notifyGuestText", () => {
  it("not_configured / invalid_phone / empty_message guards", async () => {
    expect(await notifyGuestText("0544642743", "hi", cfgUnconfigured())).toEqual({ ok: false, error: "not_configured" });
    expect(await notifyGuestText("", "hi", cfgConfigured())).toEqual({ ok: false, error: "invalid_phone" });
    expect(await notifyGuestText("0544642743", "  ", cfgConfigured())).toEqual({ ok: false, error: "empty_message" });
  });
  it("sends a plain text message when configured", async () => {
    const fetchSpy = mockFetchOk("wamid.N");
    const r = await notifyGuestText("0544642743", "نراكم قريباً", cfgConfigured());
    expect(r).toEqual({ ok: true, id: "wamid.N" });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("972544642743");
    expect(body.text.body).toBe("نراكم قريباً");
  });
});

describe("recordManualSent", () => {
  it("stamps exactly { inviteWaStatus: 'manual', inviteWaStatusAt: <number> }", async () => {
    const stamp = vi.fn().mockResolvedValue(undefined);
    await recordManualSent(stamp);
    expect(stamp).toHaveBeenCalledTimes(1);
    const patch = stamp.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.inviteWaStatus).toBe("manual");
    expect(typeof patch.inviteWaStatusAt).toBe("number");
    // No waMessages index / extra fields — a manual stamp has no wamid.
    expect(Object.keys(patch).sort()).toEqual(["inviteWaStatus", "inviteWaStatusAt"]);
  });

  it("propagates a rejecting stampGuest (the endpoint must 500, not fake success)", async () => {
    const stamp = vi.fn().mockRejectedValue(new Error("store down"));
    await expect(recordManualSent(stamp)).rejects.toThrow("store down");
  });
});

describe("isStatusProgression — manual stamps", () => {
  it("never lets a webhook receipt overwrite 'manual'", () => {
    for (const next of ["sent", "delivered", "read", "failed"]) {
      expect(isStatusProgression("manual", next)).toBe(false);
    }
  });
});

describe("extractStatusUpdates", () => {
  it("pulls id+status out of the Meta statuses[] shape", () => {
    const body = { entry: [{ changes: [{ value: { statuses: [
      { id: "wamid.1", status: "delivered", timestamp: "1700000000" },
      { id: "wamid.2", status: "read", timestamp: "1700000001" },
    ] } }] }] };
    expect(extractStatusUpdates(body)).toEqual([
      { messageId: "wamid.1", status: "delivered" },
      { messageId: "wamid.2", status: "read" },
    ]);
  });
  it("is defensive: junk / message-only events yield []", () => {
    expect(extractStatusUpdates(null)).toEqual([]);
    expect(extractStatusUpdates({})).toEqual([]);
    expect(extractStatusUpdates({ entry: "nope" })).toEqual([]);
    expect(extractStatusUpdates({ entry: [{ changes: [{ value: { messages: [{}] } }] }] })).toEqual([]);
  });
});

describe("isStatusProgression", () => {
  it("only advances forward through sent → delivered → read", () => {
    expect(isStatusProgression(undefined, "sent")).toBe(true);
    expect(isStatusProgression("sent", "delivered")).toBe(true);
    expect(isStatusProgression("delivered", "read")).toBe(true);
    expect(isStatusProgression("read", "delivered")).toBe(false);
    expect(isStatusProgression("read", "read")).toBe(false);
  });
  it("records a failure unless already read", () => {
    expect(isStatusProgression("sent", "failed")).toBe(true);
    expect(isStatusProgression("read", "failed")).toBe(false);
  });
});
