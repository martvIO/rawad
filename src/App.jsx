// Root component — detects the ?form= URL parameter, owns language state, and
// routes between the three top-level views (landing / portal / confirm form).
// Auto-resumes the portal when Firebase Auth detects an existing session.
import { useState, useMemo, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { makeT } from "./i18n/index.js";
import { auth } from "./firebase.js";
import { GlobalStyle } from "./styles/GlobalStyle.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { ConfirmationForm } from "./pages/ConfirmationForm.jsx";
import { Portal } from "./pages/portal/Portal.jsx";

export default function App() {
  // Detect URL parameter ?form=GROOM_USERNAME to show the guest confirmation form.
  const initialFormGroom = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("form") || "";
    } catch { return ""; }
  }, []);

  // view: "confirmForm" | "landing" | "portal".
  // Default to landing; auto-route to portal once Firebase confirms an active session.
  const [view, setView] = useState(initialFormGroom ? "confirmForm" : "landing");

  useEffect(() => {
    if (initialFormGroom) return;
    // Auto-resume the portal if a session already exists. Don't kick the user
    // out of the landing page if they explicitly hit "back" later (the back
    // button calls setView("landing"); we won't re-route while signed in).
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setView((v) => (v === "landing" ? "portal" : v));
    });
    return unsub;
  }, [initialFormGroom]);

  // Language (raw-string localStorage; preserves existing values).
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("dawa_lang") || "ar"; }
    catch { return "ar"; }
  });
  const t = useMemo(() => makeT(lang), [lang]);

  useEffect(() => { try { localStorage.setItem("dawa_lang", lang); } catch {} }, [lang]);
  useEffect(() => { try { localStorage.setItem("dawa_view", view); } catch {} }, [view]);

  // Apply RTL for both AR + HE.
  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <>
      <GlobalStyle />
      {view === "confirmForm" && <ConfirmationForm groomUsername={initialFormGroom} t={t} lang={lang} setLang={setLang}/>}
      {view === "landing"     && <LandingPage onEnterPortal={() => setView("portal")} t={t} lang={lang} setLang={setLang} />}
      {view === "portal"      && <Portal       onBack={() => setView("landing")} t={t} lang={lang} setLang={setLang} />}
    </>
  );
}
