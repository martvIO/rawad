# Live browser evidence (Playwright MCP) — https://dawa.to, 2026-07-16

Mobile viewport 390×844, real Chrome. Read-only session: no logins, no form submissions.

## Console cleanliness

| Page | Errors | Warnings |
|---|---|---|
| `/` (landing, AR + HE toggle exercised) | 0 | 0 |
| `/confirm/groom` | 0 | 0 |
| `/d/demo/demo?demo=1` (classic template, fully rendered) | 0 | 0 |
| `/d/demo/demo?demo=1&template=destination-love` | 0 | 0 |

## Network profile

- **Landing (`/`)**: ~177 KB measurable transfer. Font loading: 1 blocking Google-Fonts CSS + **10 woff2 files** (Cairo ×2, Amiri ×5, Heebo ×2, Frank Ruhl Libre ×1). No GTM/analytics requests, no Sentry beacon (DSN-gated), no Leaflet/unpkg on landing.
- **Demo invitation (`/d/demo/demo?demo=1`)**: 24 requests; **17 woff2 font files** (both Arabic + Hebrew families, multiple weights). Largest chunk: `CelestialCanvas-*.js` 113 KB transfer. `three.module` NOT fetched on classic template.
- **`/models/*` (7.7 MB face-api shards): never requested on any public route** — runtime confirmation that the deployed `frontend/public/models/` directory is orphaned dead weight.
- Third-party origins contacted on public pages: `fonts.googleapis.com`, `fonts.gstatic.com`, `firebasestorage.googleapis.com` (gallery images) only.
- Note: cross-origin font `transferSize` is 0 in the Resource Timing API (no `Timing-Allow-Origin`), so font byte totals are undercounted in JS probes; request *counts* are accurate.

## DOM / a11y probes

- **`/confirm/groom` inputs: ALL are `htmlFor`-label-associated and computed `font-size: 16px`** (text, tel, city autocomplete, street, house number). The 2026-06-20 audit's headline finding (zero `htmlFor`; sub-16 px iOS zoom) is **fixed** on the public RSVP form. `GlobalStyle.jsx:131-132` has the explicit 16 px iOS comment.
- Touch targets < 44×44 CSS px (still ≥ WCAG 2.5.8's 24 px unless noted):
  - Landing: **23 elements**, incl. language toggle AR/HE (38×28), "احجزوا الآن" nav CTA (81×36), footer contact buttons (36×36), nav links (h=43, borderline).
  - `/confirm/groom`: 7 elements, incl. guest-count +/− steppers (38×38), consent **checkbox 17×17** (below the 24 px WCAG 2.2 minimum; has an associated clickable label), terms link (124×24).
- Language toggle updates `<html lang>` (ar→he) and keeps `dir=rtl` correctly, **but `document.title` and meta description stay Arabic in Hebrew mode** — no head management at all.
- `navigator.serviceWorker.getRegistrations()` → **0**; manifest has a single SVG icon (`sizes: any`) — installable-PWA criteria not met (no SW, no 192/512 PNG icons).
- Digital-invite gallery `<img>` tags use `loading="lazy"` + `alt=""` (decorative pattern). Landing/static imgs mostly lack `loading` attribute (14 of 17 in source).

## Screenshots (this folder)

- `home-mobile-ar.png`, `home-mobile-he.png` — RTL renders correct in both languages.
- `demo-invite-sealed.png`, `demo-invite-open-full.png` — classic template full flow.
- `demo-destination-love.png` — bespoke template variant.
