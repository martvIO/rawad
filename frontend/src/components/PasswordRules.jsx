// Visual checklist of password rules. Pass the current password value and
// the translator (`t`); each rule lights up green when it passes, dim when
// it doesn't. The component is content-only — callers control the wrapping.
import { evaluatePassword } from "../utils/password.js";
import { C } from "../styles/theme.js";

export function PasswordRules({ password, t, compact = false }) {
  const results = evaluatePassword(password);

  return (
    <div className="pwd-rules" data-compact={compact ? "1" : "0"} style={{
      marginBottom: compact ? 10 : 14,
      padding: compact ? "10px 12px" : "12px 14px",
      borderRadius: 12,
      background: "rgba(255,255,255,.03)",
      border: "1px solid rgba(201,168,76,.18)",
    }}>
      <div style={{
        fontSize: 11, color: C.goldDim, fontWeight: 700,
        marginBottom: 8,
      }}>
        {t("pwd_rules_title")}
      </div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
        {results.map(({ id, passed }) => (
          <li key={id} style={{
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 12, lineHeight: 1.5,
            color: passed ? "#4cc97a" : C.dim,
            transition: "color .25s ease",
          }}>
            <span aria-hidden style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 16, height: 16, borderRadius: 999,
              fontSize: 10, fontWeight: 900, flexShrink: 0,
              background: passed ? "rgba(76,201,122,.18)" : "rgba(255,255,255,.04)",
              border: `1px solid ${passed ? "rgba(76,201,122,.45)" : "rgba(255,255,255,.10)"}`,
              color: passed ? "#4cc97a" : "#5a5040",
              transition: "all .25s ease",
            }}>{passed ? "✓" : "•"}</span>
            <span>{t(`pwd_rule_${id}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
