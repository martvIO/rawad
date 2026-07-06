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
        display: "inline-flex", alignItems: "flex-start", gap: 9,
        fontSize: 12.5, color: C.dim, lineHeight: 1.7, textAlign: "start",
      }}>
        <input
          id="consent-cb"
          type="checkbox"
          data-testid="consent-checkbox"
          checked={!!checked}
          onChange={(e) => onChange && onChange(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0, width: 17, height: 17, accentColor: C.gold, cursor: "pointer" }}
        />
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
