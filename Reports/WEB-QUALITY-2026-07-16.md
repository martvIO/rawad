# Dawa — Web Quality Report

**Date:** 2026-07-16 · **Target:** https://dawa.to (production; identical app at https://dawa-aa793.web.app) · **Framework:** `.agents/skills/web-quality-audit` (Lighthouse-based: Performance / Accessibility / SEO / Best Practices)

## Method

- **Lighthouse 13.4.0**, 27 lab runs against production: Tier-1 URLs (`/`, `/d/demo/demo?demo=1`, `/templates`) × 3 mobile runs + 1 desktop; Tier-2 (`/confirm/groom`, `/terms`, `/help`, `/portal/login`, destination-love template) × 1 mobile + 1 desktop. Medians reported with per-run spread. Raw output: [lighthouse/](lighthouse/) (distilled: [lighthouse/summary.json](lighthouse/summary.json)).
- **Live browser probes** (Playwright, mobile viewport 390×844, read-only — no logins, no submissions): console, network waterfall, DOM/a11y measurements, RTL screenshots → [evidence/console-network.md](evidence/console-network.md), [evidence/screenshots/](evidence/screenshots/).
- **HTTP header matrix** (curl, GET-only) across asset classes, origins and redirects → [evidence/headers.md](evidence/headers.md).
- **Fresh production build** (`npm run build`, Vite 5.4.21) + static source analysis + the skill's `analyze.sh` scanner → [evidence/build-stats.md](evidence/build-stats.md).
- **Verification:** every finding cites reproducible evidence (a Lighthouse JSON value, a curl response, or a `file:line`); machine-readable list in [findings.json](findings.json).

**Caveats & coverage gaps.** All Core Web Vitals here are **lab data** (no CrUX — traffic below threshold). The app self-reports real-user vitals on invite pages (`inviteMetrics.js` → `/invites/digital/metrics`) — use those to confirm fixes on real guests. Not measured (no safe token-free access): `/invite/:token`, `/invite/digital/:token`, `/pay/:token`, `/preview/digital/:designId`, `/g/:groomUsername`; authed portals are covered only by code-level checks and the existing report-only axe spec (`frontend/e2e/a11y/a11y-authed.spec.ts`).

---

## Scorecard

| URL (mobile / desktop) | Performance | Accessibility | Best Practices | SEO | Mobile LCP | CLS (worst) |
|---|---|---|---|---|---|---|
| `/` home | **70** (66–77) / 92 | 100 | 100 | 100 | **5.3 s** | 0.004 |
| `/d/demo/demo?demo=1` invite | **63** (63–79) / 92 | 96 | 100 | 100 | **6.0 s** | 0.006 (desktop) |
| `/templates` gallery | **67** (66–68) / 96 | 100 | 100 | 100 | **5.1 s** | 0 |
| `/confirm/groom` RSVP | 83 / 82 | 100 | 100 | 100 | 3.6 s | **0.324 desktop** |
| `/terms` | 75 / 98 | **89** | 100 | 100 | 4.2 s | 0.015 |
| `/help` | 95 / 89 | **92** | 100 | 100 | 2.4 s | **0.217 desktop** |
| `/portal/login` | 75 / 95 | 100 | 100 | 63¹ | 4.2 s | 0.002 |
| `/d/…&template=destination-love` | 83 / — | 96 | 100 | 100 | 3.7 s | — |

¹ Intentional: `robots.txt` disallows `/portal` by design — not a defect.

The shape of the story: **best practices and security are excellent, accessibility is near-clean, SEO is fine for a deliberately WhatsApp-first business — and mobile performance is the one failing category, on exactly the pages guests open from WhatsApp on phones.** Notably, the new bespoke `destination-love` template (83, LCP 3.7 s) is markedly faster than the classic template (63, LCP 6.0 s).

---

## Audit results

### Critical issues (0 found)

None. No security vulnerabilities in the served site, no complete failures. (The one npm-critical advisory is a dependency-hygiene issue, rated High below with rationale.)

### High priority (5 found)

- **[Performance] PERF-01 — Mobile LCP fails on every key public route.** Medians: home **5.3 s**, demo invite **6.0 s**, templates **5.1 s**, login/terms 4.2 s, RSVP 3.6 s — all above the 2.5 s threshold; mobile perf scores 63–83 while desktop passes everywhere (82–98).
  - **Impact:** guests open invites from WhatsApp on phones — this is the platform's primary audience seeing its slowest experience. LCP breakdown on home: TTFB 489 ms + **element render delay 2,480 ms** — the LCP is text, blocked by font CSS and JS boot, not a slow image.
  - **Fix:** the two structural fixes below (PERF-02 fonts, PERF-05 main chunk) plus BP-01's self-heal. Evidence: `lighthouse/summary.json`, `home.mobile.report.json → lcp-breakdown-insight`.

- **[Performance] PERF-02 — Render-blocking Google Fonts stylesheet: 5 families × 19 weights.** One blocking `css2` request ([index.html:23](../frontend/index.html#L23)) costs **888 ms** on mobile home (`render-blocking-insight`); 10 woff2 files load on the landing page, 17 on the invite page.
  - **Impact:** the single largest contributor to PERF-01's render delay, and the root cause of PERF-04.
  - **Fix:** subset to the 2–3 critical families per language, self-host with `<link rel="preload">` for hero-critical faces, prefer variable fonts (one file per family), keep `display=swap`. (Per `performance` skill §Font optimization.)

- **[Performance] PERF-04 — Desktop CLS failure from late font swap.** `/confirm/groom` desktop CLS **0.324** (failing; `cls-culprits-insight` attributes 0.322 to a whole-`<html>` reflow caused by the late Amiri woff2), `/help` desktop 0.217. Mobile ≈ 0.
  - **Impact:** the public RSVP form visibly jumps while a guest starts filling it.
  - **Fix:** preload the 1–2 critical Arabic/Hebrew faces + `size-adjust`/`ascent-override` fallback metrics — bundle with the PERF-02 rework.

- **[Best Practices] BP-01 — Missing `/assets/*` files return index.html with a 1-year immutable cache header.** Verified: `GET /assets/<nonexistent>.js` → 200, `text/html`, `cache-control: public, max-age=31536000, immutable` ([evidence/headers.md](evidence/headers.md)). Mechanism: the `**` SPA rewrite in [firebase.json](../firebase.json) serves index.html and the `/assets/**` header rule still applies.
  - **Impact:** after every deploy, an open tab lazy-loading an old chunk gets HTML-as-JS (module error → broken navigation) and the browser caches that wrong response *immutable for a year*. Classic "broken until hard refresh," made persistent.
  - **Fix:** (1) handle Vite's `vite:preloadError` in `main.jsx` with a one-time `location.reload()` — this alone removes the user-facing breakage; (2) stop the poisoning at the hosting layer (rewrite `/assets/**` to a 404 function, or validate hashed patterns at deploy).

- **[Best Practices] BP-02 — `npm audit`: 1 critical + 17 moderate in production dependencies.** `fast-xml-parser` (7 advisories, incl. a follow-up to an incomplete CVE fix) via the AWS Amplify/SDK chain; all moderates are `@aws-sdk/*`. **Fix available.**
  - **Impact:** DoS-class, client-side context (limited exploitability — no untrusted server-side XML parsing found), but it's exactly the "bump aws-amplify" owner action left open by the 2026-07-02 security audit.
  - **Fix:** `npm audit fix --prefix frontend`, bump the amplify family, and add a scheduled `npm audit` to `security.yml` (dependency-review only gates *new* deps on PRs).

### Medium priority (7 found)

- **[Performance] PERF-03 — 7.7 MB of orphaned face-api models deployed every release (64% of dist).** Zero code references; never fetched at runtime (verified live); publicly served with `no-cache`. **Fix:** delete `frontend/public/models/` (face matching moved to AWS Rekognition server-side) — confirm the Expo app doesn't hot-link them first.
- **[Performance] PERF-05 — 654 KB main entry chunk (216 KB gzip), no vendor splitting.** `vite.config.js` has no `build` block; Vite itself warns. Route-level lazy splitting is otherwise good. **Fix:** `manualChunks` for react/router vendor + audit entry contents. (Backlog TASK-009.)
- **[Performance] PERF-06 — 6.0 s cold-start TTFB on the invite shell (`/d/**`).** Measured: cold 5.99 s → warm 0.39 s (`digitalInvitePreview` rewrite). The first guest after idle waits ~6 s on a blank screen *before* the SPA even begins. **Fix:** `minInstances: 1` on that function (small cost, kills the worst first impression), or move OG injection to the edge.
- **[Accessibility] A11Y-01 — Color-contrast failures on muted gold text.** `/terms` + `/help`: `#7a6a4a` on `#07070a` = **3.82:1** @ 12 px; invite venue block: `#a07840` on `#f8f6f0` = **3.69:1**, label `#ad8b5a` = **2.93:1** (WCAG 1.4.3 needs 4.5:1). The invite is the guest-facing money page. **Fix:** brighten/darken the muted-gold tokens — a few token lines.
- **[Accessibility] A11Y-03 — Small touch targets.** Consent checkbox **17×17 px** (below WCAG 2.2 §2.5.8's 24 px hard minimum); steppers 38×38, language toggle 38×28, 23 sub-44 px elements on landing (measured live). **Fix:** ≥24 px hit area on the checkbox now; lift key controls to 44 px per the skill's comfort rule. (Backlog TASK-UX-4.)
- **[SEO] SEO-01 — No per-route or per-language head management.** Identical Arabic title/description on every route; title stays Arabic even in Hebrew mode (verified live). Rated for UX/share value (tabs, bookmarks, language dignity), not rankings. **Fix:** a small `useDocumentTitle(route, lang)` hook — no helmet needed; server-side OG for `/d/**` already works.
- **[SEO] SEO-02 — Tokenized invite pages are indexable.** The `X-Robots-Tag: noindex` that robots.txt's own comments call for was never implemented (verified: no header on `/d/**` responses). Couple names + wedding details become indexable if a tokenized link is ever posted publicly. **Fix:** one header line in `digitalInvitePreview`; WhatsApp previews keep working (noindex ≠ preview-blocking).

### Low priority (8 found)

- **[Performance] PERF-07 — Non-hashed statics never cached** (`favicon.svg`, 110 KB `og-default.png`, manifest all `no-cache`). Fix: `max-age=86400` header rules.
- **[Performance] PERF-08 — No `srcset`/WebP and 14 of 17 `<img>` lack `loading="lazy"`** (bounded impact — SVG-first architecture; invite gallery already lazy-loads).
- **[Accessibility] A11Y-02 — Heading-order violation on `/terms`** (h3 skips a level). Trivial restructure.
- **[Accessibility] A11Y-04 — ~25 of 40 source `<label>`s not `htmlFor`-linked** — residue is portal-internal (public RSVP fully associated, verified). Sweep + consider promoting the authed axe spec from report-only to gating.
- **[SEO] SEO-03 — Duplicate origin `dawa-aa793.web.app` with no canonical tag.** Add canonical via the SEO-01 hook.
- **[SEO] SEO-04 — `www.dawa.to` has no DNS record** (connection fails; apex http→https 301 works). Add the CNAME — CORS config already anticipates it.
- **[SEO] SEO-05 — Soft-404s:** unknown paths (incl. `/sitemap.xml`) return 200 + shell and silently redirect to `/`. Render a real not-found view with `noindex`. (A sitemap remains deliberately skipped — consistent with the WhatsApp-first strategy.)
- **[Best Practices] BP-03/BP-04/BP-05 —** PWA declared but not installable (0 service workers, SVG-only icon — finish it or drop `display: standalone`); dormant `netlify.toml` carries zero security/cache headers (delete or mirror firebase.json); CSP lacks `frame-ancestors` (XFO DENY covers legacy — add the modern directive).

### What is already excellent (keep it that way)

- **Security headers:** HSTS preload (2 y), full CSP with `object-src 'none'`, nosniff, frame-deny, referrer- and permissions-policy — plus SRI-pinned Leaflet CDN. Zero console errors/warnings on every page tested.
- **Caching for hashed assets** (`/assets/**` immutable) and `no-cache` HTML — the right shape, minus the BP-01 edge.
- **Accessibility foundation:** skip link, `:focus-visible` rings, `aria-live` regions, correct `lang`/`dir` sync on language switch, axe gate in CI for public pages, and the once-headline label/zoom gaps now fixed.
- **OG/share pipeline:** per-guest server-side OG injection on `/d/**`/`/invite/**` with a proper default image.
- **Self-instrumented field vitals** on invites (TTFB/LCP/CLS/INP → `/invites/digital/metrics`) — rare for a project this size, and the right way to validate the fixes in this report.

---

## Summary

| Category | Findings | High | Medium | Low |
|---|---|---|---|---|
| Performance | 8 | 3 (PERF-01/02/04) | 3 | 2 |
| Accessibility | 4 | 0 | 2 | 2 |
| SEO | 5 | 0 | 2 | 3 |
| Best Practices | 5 | 2 (BP-01/02) | 0 | 3 |
| **Total** | **22** | **5** | **7** | **10** |

Plus 6 delta/status notes (below). Critical: 0.

## Recommended priority

1. **Font pipeline rework (PERF-02 → fixes PERF-04, biggest lever on PERF-01).** Subset + self-host + preload + fallback metrics. One change eliminates ~900 ms of mobile render-blocking *and* the failing desktop CLS.
2. **`vite:preloadError` self-heal + `/assets` 404 (BP-01).** Low effort; removes a real post-deploy breakage class that users currently only escape by hard-refreshing.
3. **`npm audit fix` + amplify bump (BP-02).** Trivial, closes a standing security-audit action.
4. **Delete `frontend/public/models/` (PERF-03).** One `git rm` shrinks every deploy by 64%.
5. **Contrast tokens + checkbox hit area (A11Y-01, A11Y-03).** A few token/style lines close every measured WCAG failure on guest-facing pages.
6. **`X-Robots-Tag: noindex` on tokenized invites (SEO-02).** One line; privacy-adjacent, already documented as intended.
7. **`minInstances: 1` on `digitalInvitePreview` (PERF-06)** once cost is accepted — the 6 s cold start is the single worst guest first impression measured.
8. **Per-route/lang titles + canonical (SEO-01, SEO-03), then `manualChunks` (PERF-05).**
9. **Housekeeping:** static-asset cache headers, terms heading order, portal label sweep, www DNS, not-found view, netlify.toml, `frame-ancestors`, PWA decision.
10. **Add a minimal perf gate to CI (DELTA-06):** nightly Lighthouse on `/` + demo invite asserting mobile perf ≥ 80, baselined against this report — so the LCP wins, once made, stay made.

---

## Appendix — Delta vs. the 2026-06-20 five-domain audit & backlog

| Item | Status today | Evidence |
|---|---|---|
| Form-label association (audit headline: zero `htmlFor` in src) | **FIXED** on public RSVP — every input associated | Live DOM probe, [evidence/console-network.md](evidence/console-network.md); portal residue → A11Y-04 |
| iOS input-zoom (sub-16 px inputs) | **FIXED** | `GlobalStyle.jsx:131` explicit 16 px + live computed check |
| Reduced-motion fallbacks (TASK-UX-7) | **ADDRESSED** — 8 files incl. landing, splash, invite templates | grep `prefers-reduced-motion` |
| ≥44 px touch targets (TASK-UX-4) | **STILL OPEN** | A11Y-03 live measurements |
| `left:50%` invite cue (TASK-UX-1) | **STILL OPEN, benign** — centers correctly in RTL | `InviteStyles.jsx:100` |
| Bundle splitting (TASK-009) | **PARTIAL** — per-role lazy splits exist; 654 KB entry remains | PERF-05 |
| Invite-open instrumentation (TASK-UX-6) | **PARTIALLY DELIVERED** — field vitals + tap/seal timings ship today | `inviteMetrics.js` (DELTA-05) |
| aws-amplify bump (Security Audit 2026-07-02 owner action) | **STILL OPEN** | BP-02 |
| Numeric Lighthouse/CWV baseline | **NEW — delivered by this report** (the prior audit explicitly skipped it) | [lighthouse/](lighthouse/) |
| Cold-start latency, cache-poisoning hazard, contrast specifics | **NEW findings** not visible to the prior qualitative method | PERF-06, BP-01, A11Y-01 |

*Report artifacts: [findings.json](findings.json) (machine-readable), [lighthouse/summary.json](lighthouse/summary.json), evidence in [evidence/](evidence/). Raw per-run Lighthouse JSON/HTML (9.7 MB, 27 runs) is kept locally in `Reports/lighthouse/raw/` (gitignored) — regenerate with `npx lighthouse@13.4.0` per the Method section.*
