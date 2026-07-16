# Web Quality Report 2026-07-16

First **numeric** Lighthouse/Core-Web-Vitals audit of production (`https://dawa.to`) — the measurement pass that [[Five-Domain Audit Implementation 2026-06-20]] deliberately skipped. Full report: `Reports/WEB-QUALITY-2026-07-16.md` (+ `findings.json`, distilled metrics in `Reports/lighthouse/summary.json`, evidence in `Reports/evidence/`).

**Method:** 27 Lighthouse 13.4 lab runs (Tier-1 ×3 mobile + desktop; Tier-2 ×1+1), live Playwright DOM/console/network probes (read-only), curl header matrix, fresh vite build, static analysis via the `.agents/skills/web-quality-audit` skill suite. Every finding carries reproducible evidence.

## Headline

Best-practices 100 everywhere, a11y 89–100, SEO fine for the WhatsApp-first model — **mobile performance is the one failing category**: LCP 3.6–6.2 s (target ≤2.5 s) on every key public route; desktop passes everywhere. The bespoke `destination-love` template (83 / LCP 3.7 s) is much faster than the classic template (63 / 6.0 s).

## Top findings (22 total: 0 Critical, 5 High, 7 Medium, 10 Low)

1. **PERF-02 (High)** — render-blocking Google Fonts (5 families × 19 weights) costs 888 ms mobile; also causes the only CWV *failures*: desktop CLS 0.324 on `/confirm` (font-swap reflow). One font rework fixes both.
2. **BP-01 (High)** — missing `/assets/*` → 200 index.html **with 1-year immutable cache** (post-deploy stale-chunk cache poisoning). Fix: `vite:preloadError` self-heal + hosting-layer 404.
3. **BP-02 (High)** — npm audit: 1 critical (`fast-xml-parser` via aws-amplify chain, fix available) + 17 moderate; the standing "bump aws-amplify" action from [[Security Audit 2026-07-02]].
4. **PERF-03 (Med)** — `frontend/public/models/` = 7.7 MB orphaned face-api shards (64% of dist), zero refs, never fetched. Delete.
5. **PERF-06 (Med)** — `/d/**` invite shell cold-start TTFB **6.0 s** (warm 0.39 s); `minInstances: 1` on `digitalInvitePreview` is the lever.
6. **A11Y-01 (Med)** — contrast: muted gold `#7a6a4a` 3.82:1 (terms/help), invite venue golds 3.69/2.93:1 — token-level fix.
7. **SEO-02 (Med)** — `X-Robots-Tag: noindex` on tokenized `/d/**` documented in robots.txt but never implemented (privacy-adjacent).
8. **SEO-01 (Med)** — no per-route/per-language head management; title stays Arabic in Hebrew mode.

## Delta vs prior audits

- **FIXED:** public-form `htmlFor` labels (was the 2026-06-20 headline), iOS 16 px input zoom, reduced-motion fallbacks (TASK-UX-7 motion half).
- **STILL OPEN:** ≥44 px touch targets (TASK-UX-4; consent checkbox 17×17 breaches WCAG 2.2 §2.5.8), 654 KB entry chunk (TASK-009 partial), aws-amplify bump, `left:50%` cue (benign).
- **NEW capability noted:** `inviteMetrics.js` ships real-user LCP/CLS/INP field vitals on invites (partially delivers TASK-UX-6) — use it to validate fixes on real guests.
- **Recommended new guardrail:** minimal nightly Lighthouse job asserting mobile perf ≥ 80 on `/` + demo invite, baselined on this report (revisits the prior audit's "skip Lighthouse-CI" call now that numbers exist).

## Links

[[Five-Domain Audit Implementation 2026-06-20]] · [[Security Audit 2026-07-02]] · [[Tasks Backlog]] · [[Digital Invitations]] · [[Visual Design System]] · [[Conversion KPIs]]
