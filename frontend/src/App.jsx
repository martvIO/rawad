// Root component — owns language state and renders the top-level routes:
//   /                       → Landing page
//   /confirm/:groomUsername → Public guest confirmation form
//   /portal/*               → Authenticated portal (login + role views)
// A back-compat effect rewrites legacy `?form=GROOM` query strings to the
// new `/confirm/GROOM` path so old WhatsApp links still work.
import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { Routes, Route, useNavigate, useLocation, matchPath } from "react-router-dom";
import { makeT } from "./i18n/index.js";
import { useDocumentTitle } from "./hooks/useDocumentTitle.js";
import { GlobalStyle } from "./styles/GlobalStyle.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { TermsPage } from "./pages/TermsPage.jsx";
import { HelpPage } from "./pages/HelpPage.jsx";
import { ConfirmationForm } from "./pages/ConfirmationForm.jsx";
import { InviteForm } from "./pages/InviteForm.jsx";
import { DigitalInviteForm } from "./pages/DigitalInviteForm.jsx";
import { DigitalInvitationPage } from "./pages/DigitalInvitationPage.jsx";
import { DigitalDesignPreviewPage } from "./pages/DigitalDesignPreviewPage.jsx";
import { PeopleGallery } from "./pages/PeopleGallery.jsx";
import { PayPage } from "./pages/PayPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";
import { Portal } from "./pages/portal/Portal.jsx";

// Public template gallery — lazy so its cards + thumbnails stay out of the
// landing/main chunk (only prospects who ask for it pay the download).
const TemplateGalleryPage = lazy(() =>
  import("./pages/TemplateGalleryPage.jsx").then((m) => ({ default: m.TemplateGalleryPage })),
);

// Route → document-title/canonical table (SEO-01, SEO-03). Central by design:
// the title belongs to the route table, and one ordered list next to <Routes> is
// far easier to keep honest than a hook call buried in each page component.
// First match wins, so the order mirrors <Routes> below; the "*" entry is the
// terminal fallback and must stay last (it makes the lookup total).
//
// `canonical: true` is opt-IN, and only for URLs we actually want indexed. A
// canonical tag is an indexing invitation, so every tokenized URL (/invite, /pay,
// /d, /preview, /g) is deliberately excluded: their path carries a guest secret,
// and publishing it in a canonical would work directly against SEO-02 (noindex on
// tokenized invites). The authed portal is excluded for the same reason it has no
// SEO value. Titles, unlike canonicals, are safe everywhere — they're brand-only,
// never per-guest, so no token or guest name ever reaches the tab.
const ROUTE_HEAD = [
  { pattern: "/", key: "doc_title_home", canonical: true },
  { pattern: "/templates", key: "doc_title_templates", canonical: true },
  { pattern: "/terms", key: "doc_title_terms", canonical: true },
  { pattern: "/help", key: "doc_title_help", canonical: true },
  { pattern: "/confirm/:groomUsername", key: "doc_title_confirm", canonical: true },
  { pattern: "/invite/digital/:token", key: "doc_title_invite" },
  { pattern: "/invite/:token", key: "doc_title_invite" },
  { pattern: "/pay/:token", key: "doc_title_pay" },
  { pattern: "/d/:groomUsername/:token/*", key: "doc_title_invite" },
  { pattern: "/preview/digital/:designId", key: "doc_title_preview" },
  { pattern: "/g/:groomUsername/*", key: "doc_title_gallery" },
  { pattern: "/portal/*", key: "doc_title_portal" },
  { pattern: "*", key: "doc_title_not_found" },
];

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

  // Head management for every route, in one place (SEO-01, SEO-03). Derived from
  // `t` — which is rebuilt on language change — so switching to Hebrew retitles
  // the tab instead of leaving the Arabic title from index.html sitting there.
  // This can't collide with the server-side OG injection on /d|/invite: that
  // rewrites the <!--OG_TAGS--> block (og:*/twitter:*, read by crawlers that
  // never run JS), and never <title> or canonical.
  const head = useMemo(
    () => ROUTE_HEAD.find((r) => matchPath(r.pattern, location.pathname)),
    [location.pathname],
  );
  useDocumentTitle(t(head.key), head.canonical ? location.pathname : null);

  // Pass `t`, `lang`, `setLang` to every routed page through render props
  // so individual pages don't have to import the i18n helper themselves.
  const langProps = { t, lang, setLang };
  const onBack = () => navigate("/");

  return (
    <>
      <GlobalStyle />
      {/* Keyboard skip-link — first focusable element, visible only on focus */}
      <a href="#main-content" className="skip-link">{t("skip_to_content")}</a>
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<LandingPage onEnterPortal={() => navigate("/portal")} {...langProps} />} />
          <Route path="/templates" element={
            <Suspense fallback={<div style={{ minHeight: "100vh", background: "#07070a" }} />}>
              <TemplateGalleryPage {...langProps} />
            </Suspense>
          } />
          <Route path="/terms" element={<TermsPage {...langProps} />} />
          <Route path="/help" element={<HelpPage {...langProps} />} />
          <Route path="/confirm/:groomUsername" element={<ConfirmationForm {...langProps} />} />
          <Route path="/invite/digital/:token" element={<DigitalInviteForm {...langProps} />} />
          <Route path="/invite/:token" element={<InviteForm {...langProps} />} />
          <Route path="/pay/:token" element={<PayPage {...langProps} />} />
          <Route path="/d/:groomUsername/:token/*" element={<DigitalInvitationPage {...langProps} />} />
          {/* Groom-facing draft preview for the native app's WebView (auth via injected tokens). */}
          <Route path="/preview/digital/:designId" element={<DigitalDesignPreviewPage {...langProps} />} />
          <Route path="/g/:groomUsername/*" element={<PeopleGallery {...langProps} />} />
          <Route path="/portal/*" element={<Portal onBack={onBack} {...langProps} />} />
          {/* Eager, unlike /templates above: this is the error path, so making it
              depend on a chunk fetch would break it exactly when the network or a
              stale deploy is already the problem (BP-01). It costs ~1 KB and its
              only import, BrandLogo, is in the main chunk already. */}
          <Route path="*" element={<NotFoundPage {...langProps} />} />
        </Routes>
      </main>
    </>
  );
}
