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
import { DigitalInvitationPage } from "./pages/DigitalInvitationPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";

// Entry-chunk diet: every route below is lazy so the two cold-start-critical
// public paths — the landing page and the guest invite (/d/**, whose page and
// classic template must render synchronously with the embedded __DAWA_INVITE__
// record) — don't pay for the portal, forms, gallery, or pay flows. NotFoundPage
// stays eager (BP-01: the error path must not depend on a chunk fetch).
const lazyPage = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const TemplateGalleryPage = lazyPage(() => import("./pages/TemplateGalleryPage.jsx"), "TemplateGalleryPage");
const ConfirmationForm = lazyPage(() => import("./pages/ConfirmationForm.jsx"), "ConfirmationForm");
const InviteForm = lazyPage(() => import("./pages/InviteForm.jsx"), "InviteForm");
const DigitalInviteForm = lazyPage(() => import("./pages/DigitalInviteForm.jsx"), "DigitalInviteForm");
const DigitalDesignPreviewPage = lazyPage(() => import("./pages/DigitalDesignPreviewPage.jsx"), "DigitalDesignPreviewPage");
const PeopleGallery = lazyPage(() => import("./pages/PeopleGallery.jsx"), "PeopleGallery");
const PayPage = lazyPage(() => import("./pages/PayPage.jsx"), "PayPage");
const Portal = lazyPage(() => import("./pages/portal/Portal.jsx"), "Portal");
const DevEnv2 = lazyPage(() => import("./pages/_DevEnv2.jsx"), "DevEnv2"); // TEMP dev harness — remove

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

  // Every lazy route MUST render inside a Suspense boundary or React crashes the
  // route; one shared splash-matched fallback keeps chunk-hops flash-free.
  const lz = (el) => (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#07070a" }} />}>{el}</Suspense>
  );

  return (
    <>
      <GlobalStyle />
      {/* Keyboard skip-link — first focusable element, visible only on focus */}
      <a href="#main-content" className="skip-link">{t("skip_to_content")}</a>
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<LandingPage onEnterPortal={() => navigate("/portal")} {...langProps} />} />
          <Route path="/templates" element={lz(<TemplateGalleryPage {...langProps} />)} />
          <Route path="/terms" element={<TermsPage {...langProps} />} />
          <Route path="/help" element={<HelpPage {...langProps} />} />
          <Route path="/confirm/:groomUsername" element={lz(<ConfirmationForm {...langProps} />)} />
          <Route path="/invite/digital/:token" element={lz(<DigitalInviteForm {...langProps} />)} />
          <Route path="/invite/:token" element={lz(<InviteForm {...langProps} />)} />
          <Route path="/pay/:token" element={lz(<PayPage {...langProps} />)} />
          <Route path="/d/:groomUsername/:token/*" element={<DigitalInvitationPage {...langProps} />} />
          {/* Groom-facing draft preview for the native app's WebView (auth via injected tokens). */}
          <Route path="/preview/digital/:designId" element={lz(<DigitalDesignPreviewPage {...langProps} />)} />
          <Route path="/envelopes-preview" element={lz(<DevEnv2 />)} />{/* TEMP owner preview — remove */}
          <Route path="/g/:groomUsername/*" element={lz(<PeopleGallery {...langProps} />)} />
          <Route path="/portal/*" element={lz(<Portal onBack={onBack} {...langProps} />)} />
          {/* Eager, unlike the lazy routes above: this is the error path, so making
              it depend on a chunk fetch would break it exactly when the network or a
              stale deploy is already the problem (BP-01). It costs ~1 KB and its
              only import, BrandLogo, is in the main chunk already. */}
          <Route path="*" element={<NotFoundPage {...langProps} />} />
        </Routes>
      </main>
    </>
  );
}
