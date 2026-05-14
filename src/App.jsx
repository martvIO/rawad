// Root component — detects the ?form= URL parameter and routes between the
// three top-level views: the guest confirmation form, the marketing landing
// page, and the role-based portal. Owns the language choice for the whole app.
import { useState, useMemo, useEffect } from "react";
import { makeT } from "./i18n/index.js";
import { load } from "./utils/storage.js";
import { GlobalStyle } from "./styles/GlobalStyle.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { ConfirmationForm } from "./pages/ConfirmationForm.jsx";
import { Portal } from "./pages/portal/Portal.jsx";

export default function App() {
  // Detect URL parameter ?form=GROOM_USERNAME to show the guest confirmation form
  const initialFormGroom = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("form") || "";
    } catch { return ""; }
  }, []);

  const [view, setView] = useState(() => {
    if (initialFormGroom) return "confirmForm";
    return load("dawa_session_authed", false) === true ? "groom" : "landing";
  });
  // Persist language choice between sessions (stored as a raw string, not JSON).
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("dawa_lang") || "ar"; }
    catch { return "ar"; }
  });
  const t = useMemo(() => makeT(lang), [lang]);

  useEffect(() => { try { localStorage.setItem("dawa_lang", lang); } catch {} }, [lang]);
  useEffect(() => { try { localStorage.setItem("dawa_view", view); } catch {} }, [view]);

  // Apply RTL for both AR + HE (Hebrew is also RTL); ensure body direction stays rtl
  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <>
      <GlobalStyle />
      {view === "confirmForm" && <ConfirmationForm groomUsername={initialFormGroom} t={t} lang={lang} setLang={setLang}/>}
      {view === "landing" && <LandingPage onEnterPortal={() => setView("groom")} t={t} lang={lang} setLang={setLang} />}
      {view === "groom"   && <Portal       onBack={() => setView("landing")} t={t} lang={lang} setLang={setLang} />}
    </>
  );
}
