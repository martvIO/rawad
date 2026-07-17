import { C } from "../styles/theme.js";
// AR / HE language toggle.

export function LangSwitcher({ lang, setLang }) {
  return (
    <div style={{
      display: "inline-flex", borderRadius: 10, overflow: "hidden",
      border: "1px solid rgba(201,168,76,.3)", background: "rgba(255,255,255,.03)",
    }}>
      {[
        { code: "ar", lbl: "AR" },
        { code: "he", lbl: "HE" },
      ].map(({ code, lbl }) => (
        <button key={code} onClick={() => setLang(code)} aria-pressed={lang === code} style={{
          // 44px box: this is the control a guest reaches for when the invite opens
          // in the wrong language, and it sits in the header of every public page.
          // It measured 38x28 — over WCAG 2.2 §2.5.8's 24px floor but under the
          // comfort target, which is the one that matters for a thumb on a phone.
          // The type stays 12px; only the tappable box grows.
          minWidth: 44, minHeight: 44, padding: "0 12px",
          fontSize: 12, fontWeight: 800, cursor: "pointer",
          background: lang === code ? "rgba(201,168,76,.18)" : "transparent",
          color: lang === code ? C.gold : C.dim,
          border: "none", fontFamily: "inherit", transition: "all .2s",
        }}>{lbl}</button>
      ))}
    </div>
  );
}
