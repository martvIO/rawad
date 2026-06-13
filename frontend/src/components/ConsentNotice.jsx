// Compact consent line for PUBLIC PII-collection forms (confirm / invite / RSVP)
// — links the guest to the Terms & Privacy page at the point of data collection,
// which the audit flagged as missing everywhere a guest submits personal data.
import { Link } from "react-router-dom";
import { C } from "../styles/theme.js";

export function ConsentNotice({ lang }) {
  return (
    <div style={{ fontSize: 11, color: C.dim, textAlign: "center", marginTop: 12, lineHeight: 1.7 }}>
      {lang === "he" ? "בשליחה אתה מסכים ל" : "بالإرسال فإنك توافق على "}
      <Link to="/terms" target="_blank" rel="noopener noreferrer"
            style={{ color: C.gold, textDecoration: "underline", textUnderlineOffset: 2 }}>
        {lang === "he" ? "תנאים ומדיניות הפרטיות" : "الشروط وسياسة الخصوصية"}
      </Link>
    </div>
  );
}
