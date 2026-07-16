# Visual Design System

The bespoke, framework-free design foundation for [[Dawa]]. Builds on the
[[Inline Styling Convention]] (100% inline styles + `theme.js` tokens, no CSS
framework). This page records the shared tokens, the icon system, and the
2026-06-20 visual-design audit + refinement pass.

## Verdict from the audit (2026-06-20)

A product/visual-design audit found Dawa **already ships a genuinely custom,
premium design** — bespoke gold-on-near-black palette, 16 hand-built invitation
themes (`digitalThemes.js`), a custom SVG brand seal + per-invite monogram
(`assets/brandSvg.js`, `BrandLogo.jsx`), and rich orchestrated motion on the
guest invite (staggered hero reveal, confetti, hearts, scroll reveals, aurora).
So the work was **"keep & refine"**, not redesign. Owner inputs: budget open to
real investment (ROI-gated), invest in both guest + operator surfaces, keep the
current aesthetic.

## What shipped (refinements)

- **Design-token scales** — `theme.js` now exports `space`, `radius`, `type`,
  `shadow`, `z` alongside the `C` palette. Values were chosen to **match the
  literals already in the code**, so adopting a token never shifts layout — a
  refactor aid, migrate opportunistically. `C` + `GlobalStyle.jsx` remain the
  only two places that define the palette.
- **Icon system** — `components/icons/Icon.jsx`: dependency-free inline-SVG set
  (`mail`, `mobile`, `clock`, `gem`, `check`, `menu`, `close`), 24×24,
  stroke-based, inherits `currentColor`. Replaces multicolor emoji that clashed
  with the dark-gold theme. **Semantic pairing: `mail` = handwritten/printed
  invite, `mobile` = digital WhatsApp invite** — keep it wherever both types
  show. Applied to the landing feature/service/pricing cards + menu toggle.
- **Interaction utilities** — `GlobalStyle.jsx` gained `.menu-item` (+ `.row`
  modifier) and `.tap`, giving inline components real CSS hover / focus-visible /
  press feedback instead of fragile `onMouseEnter` style-mutation. `CityField` +
  `StreetField` dropdowns converted.
- **Cold-load entry** — `index.html` paints a dark `#dawa-splash` + gold spinner
  via inline critical CSS before React mounts (kills the white→black flash);
  React clears `#root` on first render. Fonts moved from a JS-injected `@import`
  to `<head>` preconnect + `<link>` (download before bundle parse).
- **Brand touchpoints** — `public/favicon.svg` + `public/site.webmanifest`
  derived from the seal; `theme-color` for mobile chrome.
- **Accessibility** — secondary-text token `C.dim` bumped `#7a6a4a → #8a7a58`
  (~3.8:1 → ~4.8:1 on `#07070a`, clears WCAG AA); matching `GlobalStyle`
  literals (`.field-hint`, `.section-label`, `.nav-tab`) synced.

Verified via Playwright MCP on the built landing page: dark cold-load (no white
flash), head-loaded fonts, reachable favicon/manifest, 8 gold line icons in
correct RTL order, `dir=rtl` preserved. Shipped across commits `d7b085b`,
`aa7baf1`, `d900a47`.

## Deferred (need per-icon / paid review)

- App-wide functional/status emoji sweep (🏘 🛣 📍 etc.) + footer social row —
  taste/semantic decisions, do with review.
- Commission an on-brand **illustration set** (ornaments, empty states, default
  OG share card) — the only paid spend judged worth it early; **original
  photography is the lowest-ROI option** (real imagery is user-supplied).
- Extract `Card`/`Modal`/`Stack`/`Field` primitives; landing scroll-reveal
  parity; standardize Suspense fallbacks + expand skeletons; design-token docs.

## Standing rule — bespoke-template palettes (owner, 2026-07-15)

From the post-ship review of the first bespoke invitation template (TASK-TPL-2, `destination-love`):
**every bespoke template's palettes derive from the brand family** — near-black `#07070a` or
ivory-gold luxe grounds, `#c9a84c`-family (theme.js `C.gold`) accents, classic-envelope cream
`#f9f6f0` paper panels, wax-seal red `#b3232a` accent stamps; curated variants come from the
in-brand `digitalThemes` families (`blue`, `ivorygold`). An external source design contributes
layout / motion / ornament language, **never its color identity**. Full record + the shipped
`voyage`/`voyageAzure`/`voyageSand` retune in [[Digital Invitations]].

Related: [[Inline Styling Convention]] · [[Digital Invitations]] ·
[[CRO and IA Audit 2026-06-20]] · [[Tasks Backlog]]
