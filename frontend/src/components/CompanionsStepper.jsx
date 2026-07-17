// Shared stepper for the TOTAL headcount including the invited guest (min 1,
// "how many people are you?") on the physical confirmation forms
// (ConfirmationForm + InviteForm). The forms convert this to the stored
// `companions` value (= total − 1, people besides the guest) on submit, so the
// backend validation and "expected attendees" totals stay unchanged.
import { C } from "../styles/theme.js";
import { Num } from "./Num.jsx";

const MIN = 1;
const MAX = 21; // total = up to 20 companions + the invited guest

// `onChange` is the parent's setState setter, so we pass functional updaters —
// this keeps rapid taps from under-counting via a stale closure.
export function CompanionsStepper({ value, onChange }) {
  const v = Number.isFinite(value) ? value : MIN;
  const clamp = (n) => Math.max(MIN, Math.min(MAX, n));
  const dec = () => onChange((c) => clamp((Number.isFinite(c) ? c : MIN) - 1));
  const inc = () => onChange((c) => clamp((Number.isFinite(c) ? c : MIN) + 1));
  const btn = {
    // 44px, up from 38: the headcount stepper is the control every guest touches
    // to RSVP, on a phone, and 38 sat under the comfort target (WCAG 2.2 §2.5.8's
    // 24px floor was already met — this is about thumbs, not compliance).
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "1px solid rgba(201,168,76,.35)",
    background: "rgba(201,168,76,.06)",
    color: C.gold,
    fontSize: 20,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    lineHeight: 1,
  };
  return (
    <div
      data-testid="field-companions"
      style={{ display: "inline-flex", alignItems: "center", gap: 16, marginBottom: 14 }}
    >
      <button
        type="button"
        aria-label="-"
        data-testid="companions-dec"
        onClick={dec}
        style={btn}
      >
        −
      </button>
      <span
        data-testid="companions-value"
        style={{ fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", fontWeight: 800, color: C.goldLight, fontSize: 22, minWidth: 28, textAlign: "center" }}
      >
        <Num>{v}</Num>
      </span>
      <button
        type="button"
        aria-label="+"
        data-testid="companions-inc"
        onClick={inc}
        style={btn}
      >
        +
      </button>
    </div>
  );
}
