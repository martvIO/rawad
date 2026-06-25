// Shape for the confirmation domain module (RTDB /confirmations/{id}).
//
// Confirmation FIELD validation lives in the route (parseSubmitBody +
// sanitizeConfirmationPatch mirror database.rules.json and strip unknown keys);
// the domain module persists an already-sanitized field bag, so the field shape
// stays an open record here — same convention as the guest domain's GuestRecord.

/** A confirmation as it crosses the seam: a plain object, never a DataSnapshot. */
export interface ConfirmationRecord extends Record<string, unknown> {
  /** RTDB push key under /confirmations. */
  id: string;
}
