// Unit tests for the `events` (multi-day schedule) branch of sanitizeMediaSettings
// — the field revived on 2026-07-16 for every template (henna night + wedding day,
// each with its own venue + map link).
//
// `events` was already fully validated server-side but had NO frontend for years,
// so nothing exercised this branch. These tests pin it before 9 templates start
// rendering it, and — most importantly — pin the LOCALIZED-vs-PLAIN split across
// the shared↔server boundary, which the parked scaffold got wrong: it listed
// `icon`/`mapUrl` in the shared ARRAY_ROW_FIELDS, and the native editor writes
// every key listed there as an { ar, he } object. That would have posted objects
// into two fields the server clamps as plain strings.
import { describe, it, expect } from "vitest";
import { sanitizeMediaSettings } from "../../functions/src/api/routes/digital/sanitize";
import { DESIGN_FIELDS, MAX_EVENTS } from "../../functions/src/api/routes/digital/constants";
import { ARRAY_KEYS, ARRAY_ROW_FIELDS, TOGGLE_KEYS } from "../../../shared/src/data/digitalDesignSchema.js";

function ok(body: unknown) {
  const r = sanitizeMediaSettings(body);
  if (!r.ok) throw new Error(`expected ok, got error ${r.error}`);
  return r.value as Record<string, any>;
}

const row = (over: Record<string, unknown> = {}) => ({
  icon: "🎉",
  title: { ar: "حفلة الحنّة", he: "מסיבת חינה" },
  time: { ar: "19:00", he: "19:00" },
  venue: { ar: "بيت العائلة", he: "בית המשפחה" },
  address: { ar: "شارع النبي 86، حيفا", he: "רחוב הנביאים 86, חיפה" },
  mapUrl: "https://maps.google.com/?q=haifa",
  ...over,
});

describe("events — schema/server contract", () => {
  it("is a design field (demotes an approved design + reaches the public read)", () => {
    expect(DESIGN_FIELDS).toContain("events");
    expect(DESIGN_FIELDS).toContain("eventsEnabled");
  });

  it("is exposed to both editors via the shared schema", () => {
    expect(ARRAY_KEYS).toContain("events");
    expect(TOGGLE_KEYS).toContain("eventsEnabled");
  });

  // THE regression guard. ARRAY_ROW_FIELDS drives the native editor, which writes
  // every listed key as a localized { ar, he } object — so a key that the server
  // clamps as a PLAIN string must never appear in it.
  it("lists ONLY the localized cells in ARRAY_ROW_FIELDS (not the plain ones)", () => {
    expect(ARRAY_ROW_FIELDS.events).toEqual(["title", "time", "venue", "address"]);
    expect(ARRAY_ROW_FIELDS.events).not.toContain("icon");
    expect(ARRAY_ROW_FIELDS.events).not.toContain("mapUrl");
  });

  it("matches storyTimeline's precedent — its plain `icon` is omitted too", () => {
    expect(ARRAY_ROW_FIELDS.storyTimeline).not.toContain("icon");
  });
});

describe("sanitizeMediaSettings — events", () => {
  it("round-trips a full row, keeping icon/mapUrl plain and the rest localized", () => {
    const out = ok({ events: [row()] });
    const e = out.events[0];
    expect(e.icon).toBe("🎉");
    expect(e.mapUrl).toBe("https://maps.google.com/?q=haifa");
    expect(e.title).toEqual({ ar: "حفلة الحنّة", he: "מסיבת חינה" });
    expect(e.venue).toEqual({ ar: "بيت العائلة", he: "בית המשפחה" });
  });

  it("keeps several days in order", () => {
    const out = ok({
      events: [row({ title: { ar: "الحنّة" } }), row({ title: { ar: "الزفاف" } })],
    });
    expect(out.events).toHaveLength(2);
    expect(out.events[0].title.ar).toBe("الحنّة");
    expect(out.events[1].title.ar).toBe("الزفاف");
  });

  it("drops entirely-empty rows so the editor's blank template never persists", () => {
    const out = ok({ events: [row(), { icon: "", title: "", time: "", venue: "", address: "", mapUrl: "" }] });
    expect(out.events).toHaveLength(1);
  });

  it("keeps a row that has ANY content field, even with no icon/map", () => {
    const out = ok({ events: [{ title: { ar: "الزفاف" } }] });
    expect(out.events).toHaveLength(1);
  });

  it("does NOT keep a row that only has an icon (no content)", () => {
    // icon alone is not a schedule entry — the server's emptiness check is on the
    // four content cells, so this row is correctly dropped.
    const out = ok({ events: [{ icon: "🎉" }] });
    expect(out.events).toHaveLength(0);
  });

  it("caps the list at MAX_EVENTS", () => {
    const out = ok({ events: Array.from({ length: MAX_EVENTS + 5 }, () => row()) });
    expect(out.events).toHaveLength(MAX_EVENTS);
  });

  it("skips non-object rows instead of throwing", () => {
    const out = ok({ events: [null, "nope", 42, [], row()] });
    expect(out.events).toHaveLength(1);
  });

  it("rejects a non-array events value", () => {
    const r = sanitizeMediaSettings({ events: { not: "an array" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_events");
  });

  it("accepts an empty array (the couple cleared their schedule)", () => {
    expect(ok({ events: [] }).events).toEqual([]);
  });

  it("leaves events untouched when the key is absent", () => {
    expect(ok({ venue: { ar: "قاعة" } }).events).toBeUndefined();
  });

  it("clamps over-long text rather than rejecting the row", () => {
    const out = ok({ events: [row({ title: { ar: "ا".repeat(5000) } })] });
    expect(out.events[0].title.ar.length).toBeLessThan(5000);
  });
});
