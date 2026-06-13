// First-run guidance card. Shows the groom the intended sequence with live
// checkmarks, plus a reassurance note (e.g. "the team sends invites for you")
// so a brand-new groom isn't lost on an empty dashboard or hunting for a Send
// button that doesn't exist. Caller decides when to render/hide it.
import { C } from "../styles/theme.js";

export function OnboardingChecklist({ title, steps = [], note }) {
  return (
    <div style={{
      marginBottom: 22, padding: "16px 18px", borderRadius: 14,
      background: "linear-gradient(180deg, rgba(201,168,76,.08), rgba(201,168,76,.02))",
      border: "1px solid rgba(201,168,76,.25)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: C.gold, marginBottom: 12, fontFamily: "'Amiri','Frank Ruhl Libre',serif" }}>
        ✦ {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{s.done ? "✅" : "⬜"}</span>
            <span style={{
              color: s.done ? C.dim : C.goldLight,
              textDecoration: s.done ? "line-through" : "none",
              fontWeight: s.done ? 600 : 700,
            }}>{s.label}</span>
          </div>
        ))}
      </div>
      {note && (
        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(201,168,76,.15)",
          fontSize: 12, color: C.dim, lineHeight: 1.7,
        }}>💬 {note}</div>
      )}
    </div>
  );
}
