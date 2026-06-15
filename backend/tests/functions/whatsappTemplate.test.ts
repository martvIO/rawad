// Unit tests for the WhatsApp template send + its config gate. fetch + env are
// mocked; no real network.
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  sendWhatsAppTemplate,
  isYourPhotosTemplateConfigured,
} from "../../functions/src/whatsapp";

const ENV = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_YOURPHOTOS_TEMPLATE"] as const;
const SAVED = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  vi.restoreAllMocks();
});

function configure() {
  process.env.WHATSAPP_TOKEN = "tok";
  process.env.WHATSAPP_PHONE_ID = "123";
  process.env.WHATSAPP_YOURPHOTOS_TEMPLATE = "your_photos_ready";
}

describe("isYourPhotosTemplateConfigured", () => {
  it("requires token, phone id AND template name", () => {
    for (const k of ENV) delete process.env[k];
    expect(isYourPhotosTemplateConfigured()).toBe(false);
    process.env.WHATSAPP_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_ID = "123";
    expect(isYourPhotosTemplateConfigured()).toBe(false); // template still missing
    process.env.WHATSAPP_YOURPHOTOS_TEMPLATE = "t";
    expect(isYourPhotosTemplateConfigured()).toBe(true);
  });
});

describe("sendWhatsAppTemplate", () => {
  it("returns not_configured when creds are unset and never calls fetch", async () => {
    for (const k of ENV) delete process.env[k];
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never);
    const r = await sendWhatsAppTemplate("0501234567", "t", "ar", []);
    expect(r).toEqual({ ok: false, error: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an empty template name", async () => {
    configure();
    const r = await sendWhatsAppTemplate("0501234567", "", "ar", []);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("no_template");
  });

  it("rejects an empty phone", async () => {
    configure();
    const r = await sendWhatsAppTemplate("", "t", "ar", []);
    expect(r).toEqual({ ok: false, error: "invalid_phone" });
  });

  it("posts a well-formed template payload and returns the message id", async () => {
    configure();
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.123" }] }),
    } as never);

    const components = [{ type: "body", parameters: [{ type: "text", text: "https://x/photos" }] }];
    const r = await sendWhatsAppTemplate("+972 50-123-4567", "your_photos_ready", "ar", components);

    expect(r).toEqual({ ok: true, id: "wamid.123" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/123/messages");
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe("template");
    expect(body.to).toBe("972501234567"); // digits only
    expect(body.template.name).toBe("your_photos_ready");
    expect(body.template.language).toEqual({ code: "ar" });
    expect(body.template.components).toEqual(components);
  });

  it("surfaces a Meta API error message", async () => {
    configure();
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "template not found" } }),
    } as never);
    const r = await sendWhatsAppTemplate("0501234567", "t", "ar", []);
    expect(r).toEqual({ ok: false, error: "template not found" });
  });
});
