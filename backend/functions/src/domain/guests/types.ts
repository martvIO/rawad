// Shapes for the guest domain module (RTDB /guestsByGroom/{groomUid}/{guestId}).
//
// Guest FIELD validation lives in the route's sanitizeGuest (it mirrors the RTDB
// schema rules and strips unknown keys); the domain module persists an
// already-sanitized field bag, so the field shape stays an open record here.

/** A guest as it crosses the seam: a plain object, never a DataSnapshot. */
export interface GuestRecord extends Record<string, unknown> {
  /** RTDB push key. */
  id: string;
  /** Owning groom's subtree key. */
  groomUid: string;
}
