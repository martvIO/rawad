// Unit tests for the pure portal-guests helpers extracted from usePortalState
// (hooks/portal/guestLogic.js): the optimistic-delivery overlay and the stats.
import { describe, it, expect } from "vitest";
import { applyDeliveredOverlay, computeGuestStats } from "../../hooks/portal/guestLogic.js";

describe("applyDeliveredOverlay", () => {
  it("returns the list unchanged when the overlay set is empty", () => {
    const list = [{ id: "a", status: "pending" }];
    expect(applyDeliveredOverlay(list, new Set())).toBe(list);
  });

  it("returns non-arrays untouched", () => {
    const set = new Set(["a"]);
    expect(applyDeliveredOverlay(null, set)).toBeNull();
  });

  it("flips an overlaid guest to delivered without mutating the original", () => {
    const list = [{ id: "a", status: "pending" }, { id: "b", status: "enroute" }];
    const set = new Set(["a"]);
    const out = applyDeliveredOverlay(list, set);
    expect(out[0]).toEqual({ id: "a", status: "delivered" });
    expect(list[0].status).toBe("pending"); // original untouched
    expect(out[1]).toBe(list[1]); // unaffected rows keep their reference
    expect(set.has("a")).toBe(true); // still pending server echo
  });

  it("drops the id from the set once the server reports delivered", () => {
    const list = [{ id: "a", status: "delivered" }];
    const set = new Set(["a"]);
    const out = applyDeliveredOverlay(list, set);
    expect(out[0]).toBe(list[0]); // returned as-is
    expect(set.has("a")).toBe(false); // overlay cleared
  });

  it("leaves guests not in the set alone", () => {
    const list = [{ id: "a", status: "pending" }];
    const out = applyDeliveredOverlay(list, new Set(["other"]));
    expect(out[0]).toBe(list[0]);
  });
});

describe("computeGuestStats", () => {
  it("returns zeros for an empty list", () => {
    expect(computeGuestStats([])).toEqual({
      total: 0, delivered: 0, enroute: 0, pending: 0,
      confirmed: 0, expectedAttendees: 0, pct: 0,
    });
  });

  it("counts statuses and computes the delivered percentage", () => {
    const guests = [
      { status: "delivered" },
      { status: "delivered" },
      { status: "enroute" },
      { status: "pending" },
    ];
    const s = computeGuestStats(guests);
    expect(s).toMatchObject({ total: 4, delivered: 2, enroute: 1, pending: 1, pct: 50 });
  });

  it("expectedAttendees = each confirmed guest + their reported companions", () => {
    const guests = [
      { status: "delivered", confirmedAt: 1, companions: 2 }, // 1 + 2
      { status: "pending", confirmedAt: 1 }, // 1 + 0
      { status: "pending", confirmedAt: 1, companions: -3 }, // companions <= 0 ignored → 1
      { status: "pending" }, // not confirmed
    ];
    const s = computeGuestStats(guests);
    expect(s.confirmed).toBe(3);
    expect(s.expectedAttendees).toBe(5); // 3 + 2
  });
});
