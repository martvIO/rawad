// Unit tests for the RSVP reminder scheduler's pure selection logic — which
// guests get a reminder, and whether a wedding is in the reminder window. The
// Firestore traversal + WhatsApp send are integration concerns; the decision
// logic is what must be correct (no double-sends, no nudging answered guests).
import { describe, it, expect } from "vitest";
import { daysUntil, dueForReminder, guestNeedsReminder, REMINDER_LEAD_DAYS } from "../../functions/src/reminders";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("daysUntil", () => {
  it("counts whole days to the wedding", () => {
    expect(daysUntil(NOW + 7 * DAY, NOW)).toBe(7);
    expect(daysUntil(NOW, NOW)).toBe(0);
    expect(daysUntil(NOW - 3 * DAY, NOW)).toBe(-3);
  });
});

describe("dueForReminder", () => {
  it("is due exactly LEAD_DAYS before the wedding", () => {
    expect(dueForReminder(NOW + REMINDER_LEAD_DAYS * DAY, NOW, REMINDER_LEAD_DAYS)).toBe(true);
  });
  it("is not due on other days", () => {
    expect(dueForReminder(NOW + 6 * DAY, NOW, REMINDER_LEAD_DAYS)).toBe(false);
    expect(dueForReminder(NOW + 8 * DAY, NOW, REMINDER_LEAD_DAYS)).toBe(false);
  });
  it("guards against missing/invalid dates", () => {
    expect(dueForReminder(null, NOW, REMINDER_LEAD_DAYS)).toBe(false);
    expect(dueForReminder(undefined, NOW, REMINDER_LEAD_DAYS)).toBe(false);
    expect(dueForReminder(NaN, NOW, REMINDER_LEAD_DAYS)).toBe(false);
  });
});

describe("guestNeedsReminder", () => {
  it("reminds a pending guest with a phone and no prior reminder", () => {
    expect(guestNeedsReminder({ status: "pending", phone: "972500000000" })).toBe(true);
  });
  it("skips already-answered guests", () => {
    expect(guestNeedsReminder({ status: "attending", phone: "972500000000" })).toBe(false);
    expect(guestNeedsReminder({ status: "absent", phone: "972500000000" })).toBe(false);
  });
  it("skips guests with no phone", () => {
    expect(guestNeedsReminder({ status: "pending", phone: "" })).toBe(false);
    expect(guestNeedsReminder({ status: "pending" })).toBe(false);
  });
  it("never double-sends (reminderSentAt already set)", () => {
    expect(guestNeedsReminder({ status: "pending", phone: "972500000000", reminderSentAt: 123 })).toBe(false);
  });
});
