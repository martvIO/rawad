// Root component for the GROOM MOBILE app.
//
// Mirrors frontend/src/App.jsx's language + RTL handling, but registers ONLY the
// routes a groom needs: the portal (login + groom views), Terms, and the new
// Help page. The landing page, admin portal, and driver portal are never
// imported here, so they never enter the mobile bundle.
import { useState, useMemo, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { makeT } from "@app/i18n/index.js";
import { GlobalStyle } from "@app/styles/GlobalStyle.jsx";
import { TermsPage } from "@app/pages/TermsPage.jsx";
import { HelpPage } from "@app/pages/HelpPage.jsx";
import { MobilePortal } from "./MobilePortal.jsx";

export default function MobileApp() {
  // Language (raw-string localStorage; shares the `dawa_lang` key with the web app).
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("dawa_lang") || "ar"; }
    catch { return "ar"; }
  });
  const t = useMemo(() => makeT(lang), [lang]);

  useEffect(() => { try { localStorage.setItem("dawa_lang", lang); } catch {} }, [lang]);

  // Both AR and HE render RTL.
  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = lang;
  }, [lang]);

  const navigate = useNavigate();
  const langProps = { t, lang, setLang };
  // In the groom app, "back to home" means the portal, not the (absent) landing page.
  const onBack = () => navigate("/portal");

  return (
    <>
      <GlobalStyle />
      <a href="#main-content" className="skip-link">{t("skip_to_content")}</a>
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/terms" element={<TermsPage {...langProps} />} />
          <Route path="/help" element={<HelpPage {...langProps} />} />
          <Route path="/portal/*" element={<MobilePortal onBack={onBack} {...langProps} />} />
          {/* The app boots straight into the portal (login or groom dashboard). */}
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </main>
    </>
  );
}
