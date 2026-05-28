// Shared 0–20 stepper for "how many people will attend besides the invited
// guest" on the physical confirmation forms (ConfirmationForm + InviteForm).
import { C } from "../styles/theme.js";

const MAX = 20;

// `onChange` is the parent's setState setter, so we pass functional updaters —
// this keeps rapid taps from under-counting via a stale closure.
export function CompanionsStepper({ value, onChange }) {
  const v = Number.isFinite(value) ? value : 0;
  const clamp = (n) => Math.max(0, Math.min(MAX, n));
  const dec = () => onChange((c) => clamp((Number.isFinite(c) ? c : 0) - 1));
  const inc = () => onChange((c) => clamp((Number.isFinite(c) ? c : 0) + 1));
  const btn = {
    width: 38,
    height: 38,
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
        style={{ fontFamily: "'Amiri',serif", fontWeight: 800, color: C.goldLight, fontSize: 22, minWidth: 28, textAlign: "center" }}
      >
        {v}
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
