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
        <button key={code} onClick={() => setLang(code)} style={{
          padding: "5px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer",
          background: lang === code ? "rgba(201,168,76,.18)" : "transparent",
          color: lang === code ? "#c9a84c" : "#7a6a4a",
          border: "none", fontFamily: "inherit", transition: "all .2s",
        }}>{lbl}</button>
      ))}
    </div>
  );
}
