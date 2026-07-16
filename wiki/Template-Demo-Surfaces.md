---
date: 2026-07-16
tags: [templates, demo, marketing, admin, concept]
---

# Template Demo Surfaces

How a template gets **seen** — by a prospect, by a couple choosing one, and by the
admin curating them. Shipped 2026-07-16, alongside [[Guest Experience Metrics]].

Before this, the bespoke-template system ([[Digital Invitations]]) could render
templates but had no way to show them: the public demo was a **singleton** with no
way to pick a template, the landing showcase was a static hard-coded mockup, and
picker thumbnails were build-time assets only.

## Owner decisions (3 question rounds, 2026-07-16)
1. **All three surfaces**: public gallery + per-template shareable demo links +
   full live preview from the groom's picker.
2. **ONE shared demo content** — the single admin-published demo design
   (`appConfig/demoDesign`) is rendered by *every* template. A per-template demo =
   same content, different `templateId`. (Not per-template demo docs.)
3. **Gallery = BOTH** a compact landing strip AND a dedicated page; shows **all**
   templates (classic + every bespoke; future ones appear automatically).
4. **Upload = template preview covers only** (not demo media, not templates-as-data).

## The pieces

| Surface | Path |
|---|---|
| Per-template demo link | `/d/demo/demo?demo=1&template=<id>` — built by `utils/templateDemo.js` (`demoPreviewUrl`) |
| Override logic | `utils/demoOverrides.js` (pure, unit-tested) |
| Public gallery | `/templates` → `pages/TemplateGalleryPage.jsx` (lazy route) |
| Landing strip | `TemplateStripSection` in `LandingPage.jsx` (after ShowcaseSection) |
| Shared card | `components/TemplateCard.jsx` (gallery + strip, `compact` variant) |
| Groom picker preview | "معاينة حيّة" button per card in `DigitalDesignEditor.jsx` |
| Cover upload (admin) | `pages/portal/admin/TemplateAssetsSection.jsx`, inside the Demo tab |
| Cover endpoints | `api/routes/digital/templateAssets.routes.ts` |
| Cover resolver | `hooks/useTemplateAssets.js` |

## `?template=` semantics (order matters)
1. Base = published `appConfig/demoDesign` (else the built-in fallback).
2. `?template` — validated against `DIGITAL_TEMPLATE_KEYS`; **unknown → ignored**
   (the registry's classic fallback still guards render). On a real switch, the
   presentation defaults are **reset** to that template's own
   (theme/font/envelope), mirroring the editor's `onPickTemplate`. This is
   required, not cosmetic: a bespoke template only renders its curated palettes,
   and the demo doc may be saved with a non-curated classic theme.
3. `?theme` — applied AFTER the reset, and only if valid **for the effective
   template** (curated list honored; classic accepts any global key).
4. `?font` (validated), `?date`, `?name` as before.

Demo mode uses a **per-mount synthetic token** so `useIntroPhase`'s
per-token "already seen → skip" fast path can't suppress the ritual for a
prospect browsing several template demos.

## Template preview covers
- Pointer doc `appConfig/templateAssets`: `{ [templateId]: {url, storagePath, updatedAt} }`
  (bounded by template count → one cheap cacheable public read serves every surface).
  Bytes in Storage under `templateAssets/{templateId}/`.
- **Deliberately NOT a design field** — a cover describes the *template*, not a
  couple's design, so the bespoke "no new design-doc fields" hard rule holds and
  every mint/sanitize/PUBLIC_DESIGN_FIELDS/snapshot path is untouched.
- Images only, **SVG rejected** — the bucket is public-read, so active markup
  there would be a JS/phishing host on a Google domain (mirrors `digitalMedia`).
  Admin-gated + rate-limited; uploads merge (never clobber a sibling template) and
  sweep the superseded object.
- Resolution chain: **uploaded → bundled (`templates/thumbs.js`) → themed
  ornament**. Memoized once per page load, so strip + gallery + picker share one
  request. A template with no cover renders a text-free ornament in its own
  palette (repeating the name there read as a bug).
- `thumbs.js` was split out of `registry.js` so gallery/landing chunks don't pull
  in the eager classic `DigitalInvitationView`.

## Admin placement
The cover uploader lives **inside the Demo tab**, not a new tab: that tab is
already the admin's public-showcase surface, covers change rarely, and the demo
editor directly below is the natural way to verify how a template looks before
choosing art for it. (The admin `templates` tab is unrelated — WhatsApp *message*
templates.)

## Verified (Playwright MCP, 2026-07-16)
Gallery renders one card per registered template (classic = ornament,
destination-love = cover) at 390px, RTL, brand gold; landing strip shows both +
"view all"; `?template=destination-love` mounts the bespoke tree with the SHARED
demo content ("كريم & سالي"); `?template=classic` switches back; curated-theme
gating and unknown-id rejection confirmed live. The `templateAssets` 404 in dev
(prod API lacks the endpoint until deploy) correctly falls back to bundled art —
the designed chain.

## Related
[[Digital Invitations]] · [[Guest Experience Metrics]] · [[Visual Design System]] ·
[[Usability Templates Test Plan]] · [[Tasks Backlog]]
