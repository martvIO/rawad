// Consent CHECKBOX for PUBLIC PII-collection forms (confirm / invite / RSVP).
// The guest must tick it before the form submits; it links to the Terms &
// Privacy page at the point of data collection. `error` shows a red warning
// (set by the form when the guest tries to submit without agreeing).
import { Link } from "react-router-dom";
import { C } from "../styles/theme.js";

export function ConsentNotice({ lang, checked, onChange, error }) {
  return (
    <div style={{ marginTop: 14, marginBottom: 14, textAlign: "center" }}>
      <div style={{
        // gap is 5, not 9: the checkbox's wrapping label adds 4px of padding on
        // every side, so the *visual* gap to the text still reads as 9.
        display: "inline-flex", alignItems: "flex-start", gap: 5,
        fontSize: 12.5, color: C.dim, lineHeight: 1.7, textAlign: "start",
      }}>
        {/* The box stays 17px — the design's size — but a bare 17px checkbox is a
            17px pointer target, under WCAG 2.2 §2.5.8's 24px hard minimum, on a
            form that collects a guest's personal data. Wrapping it in a padded
            label grows the target to 25px (17 + 4 + 4) without touching the box:
            clicking the padding hits the label, which toggles the input. The
            negative marginTop cancels the padding so the box lands exactly where
            it did before (2px down from the text's flex line). */}
        <label
          htmlFor="consent-cb"
          style={{ display: "inline-flex", flexShrink: 0, padding: 4, marginTop: -2, cursor: "pointer" }}
        >
          <input
            id="consent-cb"
            type="checkbox"
            data-testid="consent-checkbox"
            checked={!!checked}
            onChange={(e) => onChange && onChange(e.target.checked)}
            style={{ display: "block", width: 17, height: 17, accentColor: C.gold, cursor: "pointer" }}
          />
        </label>
        <span>
          <label htmlFor="consent-cb" style={{ cursor: "pointer" }}>
            {lang === "he" ? "אני מסכים/ה ל" : "أوافق على "}
          </label>
          <Link to="/terms" target="_blank" rel="noopener noreferrer"
                style={{ color: C.gold, textDecoration: "underline", textUnderlineOffset: 2 }}>
            {lang === "he" ? "תנאים ומדיניות הפרטיות" : "الشروط وسياسة الخصوصية"}
          </Link>
        </span>
      </div>
      {error && (
        <div data-testid="consent-error" role="alert" aria-live="assertive"
             style={{ color: C.red, fontSize: 12.5, fontWeight: 700, marginTop: 9 }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
