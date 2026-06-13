// Unit tests for contact helpers (WhatsApp / tel / mailto URL builders +
// resolveContact merge of admin-managed public settings over config fallback).
import { describe, it, expect } from "vitest";
import { buildWhatsAppUrl, telUrl, mailtoUrl, resolveContact } from "../../utils/contact.js";

describe("buildWhatsAppUrl", () => {
  it("strips non-digits and builds a wa.me URL", () => {
    expect(buildWhatsAppUrl("+972 50-123-4567")).toBe("https://wa.me/972501234567");
  });
  it("appends an encoded prefilled message", () => {
    expect(buildWhatsAppUrl("972500000000", "hi there"))
      .toBe("https://wa.me/972500000000?text=hi%20there");
  });
  it("returns empty string when there is no number", () => {
    expect(buildWhatsAppUrl("")).toBe("");
    expect(buildWhatsAppUrl(null)).toBe("");
    expect(buildWhatsAppUrl("abc")).toBe("");
  });
});

describe("telUrl / mailtoUrl", () => {
  it("keeps a leading + and strips separators on tel", () => {
    expect(telUrl("+972 50-123")).toBe("tel:+97250123");
    expect(telUrl("050-123")).toBe("tel:050123");
    expect(telUrl("")).toBe("");
  });
  it("builds a mailto", () => {
    expect(mailtoUrl("a@b.com")).toBe("mailto:a@b.com");
    expect(mailtoUrl("")).toBe("");
  });
});

describe("resolveContact", () => {
  it("prefers public settings over config fallback and fills missing as empty", () => {
    const out = resolveContact({ whatsapp: "972500000000", facebook: "https://fb.com/x" });
    expect(out.whatsapp).toBe("972500000000");
    expect(out.facebook).toBe("https://fb.com/x");
    expect(out.instagram).toBe("");
  });
  it("is null-safe", () => {
    const out = resolveContact(null);
    expect(out).toHaveProperty("whatsapp");
    expect(out).toHaveProperty("email");
  });
});
