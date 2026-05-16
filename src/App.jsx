// Root component — owns language state and renders the top-level routes:
//   /                       → Landing page
//   /confirm/:groomUsername → Public guest confirmation form
//   /portal/*               → Authenticated portal (login + role views)
// A back-compat effect rewrites legacy `?form=GROOM` query strings to the
// new `/confirm/GROOM` path so old WhatsApp links still work.
import { useState, useMemo, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { makeT } from "./i18n/index.js";
import { GlobalStyle } from "./styles/GlobalStyle.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { ConfirmationForm } from "./pages/ConfirmationForm.jsx";
import { Portal } from "./pages/portal/Portal.jsx";

export default function App() {
  // Language (raw-string localStorage; preserves existing values).
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("dawa_lang") || "ar"; }
    catch { return "ar"; }
  });
  const t = useMemo(() => makeT(lang), [lang]);

  useEffect(() => { try { localStorage.setItem("dawa_lang", lang); } catch {} }, [lang]);

  // Apply RTL for both AR + HE.
  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = lang;
  }, [lang]);

  const navigate = useNavigate();
  const location = useLocation();

  // Back-compat for the old `?form=GROOM` URLs — silently rewrite to /confirm/GROOM.
  useEffect(() => {
    if (location.pathname !== "/") return;
    try {
      const params = new URLSearchParams(location.search);
      const groom = params.get("form");
      if (groom) navigate(`/confirm/${encodeURIComponent(groom)}`, { replace: true });
    } catch {}
  }, [location.pathname, location.search, navigate]);

  // Pass `t`, `lang`, `setLang` to every routed page through render props
  // so individual pages don't have to import the i18n helper themselves.
  const langProps = { t, lang, setLang };
  const onBack = () => navigate("/");

  return (
    <>
      <GlobalStyle />
      <Routes>
        <Route path="/" element={<LandingPage onEnterPortal={() => navigate("/portal")} {...langProps} />} />
        <Route path="/confirm/:groomUsername" element={<ConfirmationForm {...langProps} />} />
        <Route path="/portal/*" element={<Portal onBack={onBack} {...langProps} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
