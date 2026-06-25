// Pure helpers for the portal guests hook — extracted so the optimistic-delivery
// overlay and the stats computation are unit-testable without rendering the hook
// (see __tests__/utils/guestLogic.test.js).

// Apply the "just delivered" optimistic overlay to a guest list so a poll that
// lands before the server echoes the delivery doesn't flip the card back to
// pending. MUTATES `set` (the optimistically-delivered ids): an id is dropped
// once the server itself reports the guest as "delivered".
export function applyDeliveredOverlay(list, set) {
  if (!set.size || !Array.isArray(list)) return list;
  return list.map((g) => {
    if (!set.has(g.id)) return g;
    if (g.status === "delivered") {
      set.delete(g.id); // server caught up
      return g;
    }
    return { ...g, status: "delivered" };
  });
}

// Delivery + attendance stats for a guest list. A physical guest "confirms" by
// submitting the form (stamps confirmedAt); expected attendees = each confirmed
// guest + the companions they reported.
export function computeGuestStats(guests) {
  const total = guests.length;
  const delivered = guests.filter((g) => g.status === "delivered").length;
  const enroute = guests.filter((g) => g.status === "enroute").length;
  const pending = guests.filter((g) => g.status === "pending").length;
  const confirmedGuests = guests.filter((g) => g.confirmedAt);
  const confirmed = confirmedGuests.length;
  const expectedAttendees = confirmedGuests.reduce(
    (sum, g) => sum + 1 + (Number(g.companions) > 0 ? Number(g.companions) : 0),
    0,
  );
  return {
    total,
    delivered,
    enroute,
    pending,
    confirmed,
    expectedAttendees,
    pct: total ? Math.round((delivered / total) * 100) : 0,
  };
}
