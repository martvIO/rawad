---
date: 2026-05-26
sources:
  - DATABASE_SCHEMA.md
  - API_CONTRACTS.md
  - KNOWN_BUGS.md
tags: [digital, firestore, media, concept]
---

# Digital Invitations

One of two invite types a [[User Roles|groom]] can run in [[Dawa]] (the other being Handwritten/physical delivery). Digital invites are WhatsApp-link-only and are the **one part of the app backed by Firestore**, not RTDB — see [[Data Storage Model]].

## What it includes
- **Digital guest list** — `digitalGuests/{groomUid}/guests/{guestId}` (status: pending | attending | absent)
- **Background media** — one wedding image/GIF/video per groom (`digitalMedia/{groomUid}`)
- **Photographer files** — uploads under `photographerFiles/{groomUid}` (photographers upload without an account in the current design)
- **Luxury editorial microsite (2026-05-28 redesign)** — the public page (`DigitalInvitationView`) is a multi-section cinematic scroll: envelope intro → ambient petals/sparkles → hero (monogram ring + stacked couple names + date/venue chip + guest greeting) → **story timeline** (alternating cards) → **photo gallery + lightbox** (with per-photo captions) → **details cards** → **venue + animated faux-map + nearby hotels** → countdown → **enhanced RSVP** (attending/absent + companions stepper + meal chips + song request + note, confetti/hearts on submit) → **guestbook** → footer → floating dock (music/share/calendar). All colors flow from the shared `digitalThemes` tokens so theme/font switching still works. Styles are scoped under `.dawa-inv` so no other surface is affected. Design source: the `dawa-design-system` handoff bundle (`ui_kits/digital-invite`).
- **Self-serve design editor** — groom customizes *every* field: names, monogram, eyebrow, wedding date, venue/city/address/access note, dress code, story timeline (add/remove), gallery photos + captions, detail cards (add/remove), nearby hotels (add/remove), RSVP options (meal options + companions/meal/song toggles), guestbook wishes, gift, music, theme (5 palettes), font (3). A **"fill with sample content"** button seeds empty sections from the design template. Every section has an ON/OFF toggle (default ON) — nothing is cut unless the groom unchecks it. Live preview rendered via shared `DigitalInvitationView`. Sample defaults live in `src/data/digitalInviteDefaults.js`.
- **Design approval state machine** — `designStatus: draft → pending_approval → approved | rejected` on `digitalInvitations/{uid}`. Admin approves via `/digital/:uid/design/approve` or rejects with note via `/digital/:uid/design/reject`. Digital invite minting is gated on `designStatus === "approved"` (403 `design_not_approved` otherwise). Editing a design field while approved auto-demotes to draft.
- **Design snapshot version-locking** — every minted digital invite token embeds the approved design as a `designSnapshot` in its RTDB record. Already-sent links keep their original design even after the groom edits and re-approves a new version.
- **Public invitation page** — `/d/:groomUsername/:token/*` (`DigitalInvitationPage.jsx`). Reads `designSnapshot` from the token when present, falls back to the live `/digital/:uid/public` doc for legacy tokens.
- **Custom domain** — both physical and digital invite links use `https://invite.dawa.to` by default (overridable via `VITE_INVITE_BASE_URL`).

## API
Routes under `/digital/*`: guests CRUD, `media` upload/delete + design-field PATCH whitelist (now also: eyebrow, monogram, venueCity, accessNote, dressCode, storyTimeline[], details[], hotels[], wishes[], mealOptions[], mediaCaptions{}, and the section toggles detailsEnabled/venueEnabled/guestbookEnabled/envelopeEnabled/rsvpCompanionsEnabled/rsvpMealEnabled/rsvpSongEnabled — all in `DESIGN_FIELDS` so editing them demotes an approved design to draft), `photographer` upload/delete, design state-machine endpoints (`/design/submit`, `/cancel`, `/approve`, `/reject`), and the admin-only `/design-list` grid feed. The public RSVP submit (`/invites/digital/submit`) now also accepts `companions`/`mealPreference`/`songRequest`, stored on the guest doc. **`companions`** (people attending besides the invited guest, 0–20, default 0) is the unified attendee field across both invite types — the physical confirmation forms (`/confirmations`, `/invites/submit`) collect it too, and the groom sees per-guest `+N` badges plus an "expected attendees" dashboard total (`confirmed/attending + Σ companions`). RTDB `companions` validation lives in `database.rules.json` (`guestsByGroom`, `confirmations`). The `designSnapshot` embedded at mint time now spreads the **full** design doc (so distributed links render every new section). See [[API Contracts]].

## Bilingual content, total headcount, required phone (2026-05-29)
- **Bilingual groom content** — every groom-authored design text field can now hold a localized `{ ar, he }` object (legacy plain strings still work, treated as Arabic). `src/utils/localize.js` (`localize` / `localizeItems` / `localizeList` / `hasContent`) resolves the active language with a fallback to the other, so a half-filled field never blanks. `DigitalInvitationView` renders every field via `localize`; the **design editor** (`DigitalDesignEditor`) gained an Arabic/Hebrew **language tab** (`editLang`) and every text input + array leaf edits the selected language's slot (`leaf`/`setLeaf` helpers; "fill sample" seeds both languages). Backend `sanitizeMediaSettings` accepts the `{ar,he}` shape via `clampLocalized` (`digital.ts`; field types widened to `Localized = string | {ar?,he?}`). `designSnapshot` carries the localized objects unchanged.
- **Guest language toggle** — the public `/d/...` invitation shows a fixed AR/HE toggle (`LangToggle` in `DigitalInvitationView`) wired to the app `lang`/`setLang` (persisted in `dawa_lang`). It switches both built-in UI strings and groom content. The demo route (`?demo=1`) ships bilingual sample content.
- **RSVP = total headcount** — the attendance question now asks "how many are you? (including the guest)" (min 1) instead of "companions besides you" (min 0). The UI tracks `partySize` (min 1) but still **stores `companions = partySize − 1`**, so backend validation (0–20) and the "expected attendees" totals are unchanged. Shared `CompanionsStepper` is now a total stepper (min 1 / max 21); the `conf_form_companions` i18n string was reworded.
- **Required guest phone on digital RSVP** — the digital invitation RSVP now has an editable, **required** phone field (`dir=ltr`), pre-filled from the token but changeable. `submitDigitalGuestInvite` sends `submittedPhone`; `/invites/digital/submit` requires + `normalisePhone`-validates it and stores it as the guest's `phone`. (Physical forms already collected phone.)
- **Groom can no longer self-send** — the groom guest-list "📲 Send Invite" button was removed; **only the admin Send tab** mints/sends WhatsApp invites, in both digital and manual modes. See [[Security Model]].
- **Number / RTL alignment** — `src/components/Num.jsx` (`<bdi dir="ltr">` isolate) wraps numeric tokens (phones, counts, dates, companion badges, distances/accuracy) that sit inline in Arabic/Hebrew text, across the guest pages and all portals. Complements [[Digit Normalization]] (which guarantees Western digits; `Num` fixes their *placement* in RTL runs).

## Face matching ("صورك") — server-side face index (2026-06-12)
The guest photos page (`/d/:user/:token/photos`) now runs on a server-side face index: a Cloud Function indexes every photographer photo's faces once at upload; the guest scans once (after a biometric consent screen) and gets an instant, uncapped, auto-refreshing gallery on every revisit, plus rescan and delete-my-face-data buttons. Full design, privacy posture, and the descriptor-compatibility invariant: [[Face Matching]].

## Shared PhoneInput + contacts import (2026-06-19)
- **Guest phone fields use the shared `PhoneInput`** — both the digital-invitation RSVP (`components/digital/sections/InviteRsvp.jsx`) and the "your photos" enrollment (`pages/DigitalYourPhotos.jsx`) replaced their bare `<input>` with the groom-portal `components/PhoneInput.jsx` (country picker, 2-3-4 formatting, live ✓, and **Arabic-Indic→Latin digit conversion via `toWesternDigits`**). This fixed a real bug: the bare inputs silently dropped Arabic numerals (٠١٢٣) so a guest typing them saw "invalid phone". Submit/enroll now gate on the exported `isCompletePhone(e164)`. Server `normalisePhone` already accepts E.164, so no backend change.
- **Import guests from contacts (vCard / CSV)** — the digital add-guest bulk panel (`pages/portal/groom/digital/DigitalAddGuest.jsx`) gained a "📇 import from contacts" file upload. `utils/contactsImport.js` (dependency-free) parses `.vcf` (FN/N + prefers a CELL/MOBILE TEL, unfolds folded lines) and `.csv`/`.tsv` (skips header, picks the most-digit cell as phone so an email column isn't mistaken for one) into "Name, Phone" lines that feed the existing `parseGuestLines` preview + dedup + batch-add. **Truth about platforms:** no browser has a native contact picker on iPhone Safari or desktop (`navigator.contacts.select` is Android-Chrome-only) — file upload is the only universal method; the user exports contacts to a `.vcf`/`.csv` and uploads. Unit tests: `__tests__/utils/contactsImport.test.js`.

## Bloom envelope shipped as a selectable style + per-invitation colours (2026-07-18)
A second opening-envelope **shape** — `bloom`, a portrait envelope whose four triangular
flaps fold outward in an X to reveal a warm glow, with a falling-snow (snowflake) emboss on
the cardstock and a circle-crack wax seal — is now a **groom-selectable style** in the design
editor, alongside `classic`. It was already fully built in the renderer (`STYLE_PRESETS.bloom`
→ `buildEnvelopeBloom` in `envelopeMesh.js`); this change wired it into the editor + let its
colours be customised per invitation.

- **Style picker:** added `{ key: "bloom", … }` to `ENVELOPE_STYLES` in
  `shared/src/data/digitalTemplates.js` (the one list both the web + native editors read).
  Persists as `design.envelope.style`; the backend already validated it as a free slug.
- **The real fix:** `buildEnvelope` previously did `...(styled ? preset.palette : colors)`,
  which **discarded the groom's colours** for any styled preset — every picker was a no-op
  under bloom. Now it threads the **raw** `design.envelope` overrides (not the theme-resolved
  `colors`) and layers the explicit hex picks OVER the preset palette, so an untouched bloom
  keeps its signature blush/ivory/gold defaults and only picked colours win. `glow` (reveal
  light + rays), `snow` (floral emboss tint), `linen` flow through a per-render bloom preset;
  the foil pick also drives the seal emblem gold (derived `foilBright` → `sealLogo`).
- **Plumbing:** `overrides` (raw `design.envelope`) now rides alongside `colors` through
  `CelestialAmbience` → `celestialEngine.buildEnvelope`; the editor's `EnvelopePreview` passes
  the chosen `style` + `overrides` and re-bakes on style/glow/snow change. The classic path is
  unchanged (still uses `colors`).
- **Editor UI:** `envIsBloom` gates the envelope rows — cardstock(`paper`)/wax/gold(`foil`)
  always; **glow + snow** pickers shown only for bloom; inner-card(`cardPaper`/`cardInk`) and
  the arabesque star toggles/sliders hidden for bloom (it has neither). The background **stars**
  colour was already a separate wired control (`design.starfield.color`).
- **Backend (the one DB-adjacent change):** added `glow`,`snow` to `ENVELOPE_COLOR_KEYS`
  (`constants.ts`) + the `EnvelopeSettings` type so `sanitizeEnvelope` persists them as `#rrggbb`;
  no `firestore.rules`/`database.rules.json` change (design docs are owner/admin-gated, no
  field-level validate). Tests in `digitalEnvelopeSanitize.test.ts` (14/14).
- **Bloom motion polish** carried in the same files (earlier this session): the reveal rays now
  light the side-triangles' shared upper edges; a falling-snow emboss replaced the earlier
  florals; the circle-crack wax seal was restored; and the hand-off is **instant** — the moment
  the flaps vanish (openT 0.83→0.89 dissolve, `HANDOFF_AT` 0.90) the digital invitation opens,
  with no white page and no camera glide (`DIRECT_HANDOFF`).
- Still deployed with the temp `/envelopes-preview` (`_DevEnv2.jsx`) no-login harness; safe to
  remove now the in-editor picker supersedes it. Verified: builds + unit tests + a clean 3-lens
  adversarial code review (0 blockers/majors). Headless WebGL screenshotting was flaky this
  session, so the live editor flow is owner-verified. See [[Visual Design System]].

## Celestial 3D envelope — luxury PBR build, white/gold recolour (2026-06-29)
The invitation's opening ceremony is a procedural **three.js** envelope inside a drifting particle world (`components/digital/celestial/`: `celestialEngine.js`, `CelestialCanvas.jsx`, `envelopeMesh.js`, `particles.glsl.js`; orchestrated by `sections/CelestialAmbience.jsx`, with the legible sealed text as a DOM overlay in `CelestialEnvelopeOverlay.jsx`). The lazy three.js chunk loads only when the world runs.

**The envelope is the full PBR "luxury" build**, restored from the merged `feat/arch-tech-debt-seams` work (commit `2f56adf`/`3a9345a`) after an interim commit (`eb3ca55`) had stripped it to a flat `MeshBasicMaterial` envelope:
- **PBR materials** (`MeshStandard`/`MeshPhysical`) lit by lights that are children of the envelope group, with an equirectangular studio `CanvasTexture` env-map. The engine turns on **ACES filmic tone-mapping + sRGB output + antialias** while an envelope is present (the particle `ShaderMaterial` is `toneMapped:false`, so the field is byte-unaffected).
- **Gold-foil arabesque flap** (girih lattice via metalness/roughness maps), **satin silk flap lining** revealed as the flap pivots ~180°, a **glossy clearcoat wax seal** stamped with the gold دعوة emblem (drawn via `Path2D` from `BRAND_ICON_PATHS` — no `<img>`, no canvas taint), gold hairline edges, and two gold-spark/shockwave **bursts**.
- **Baked invitation card** — the couple's names (bilingual AR + HE), blessing, welcome and date are baked into the card's `CanvasTexture` (`makeCardTextures`), re-baked once the wedding fonts load (`refreshCard()` on `document.fonts.ready`). It rises out of the V-pocket and dissolves into light. Because the card carries the names, the DOM overlay's couple-names "revealing" block was **removed** — the overlay now shows only the sealed guest-name + tap cue (`CelestialEnvelopeOverlay.jsx`).
- **Telephoto camera choreography** — the engine applies the pose returned by `env.framePose()` / `env.setOpen(t, fov, aspect)` (an intimate 34° fov) while framing/opening, then glides back to the wide 62° starfield on hand-off.

**White-default + theme-aware recolour, gold-foil constant** (the user's choice):
- New pure mapper `utils/themeToEnvelopePalette.js` maps each theme → the envelope's physical palette (matte `paper`, glossy `wax`, cream `cardPaper`, dark `cardInk`). Light themes (white, champagne, …) → creamy ivory stationery that reads white by default; dark themes → deep jewel tones. Contrast-safe luminance clamps keep the card light + ink dark so the calligraphy is legible on every theme.
- **Foil is always metallic gold** (`#caa14e` / `#f5e4ab`) on every theme — white+gold is the luxury constant, so the arabesque, seal emblem, edges and sparks stay gold while only paper/wax/card recolour.
- Content threaded `DigitalInvitationView → CelestialAmbience → CelestialCanvas → engine → buildEnvelope({ colors, content })`; restored `DEFAULT_BLESSING`/`DEFAULT_WELCOME` (`data/digitalInviteDefaults.js`) and `BRAND_ICON_PATHS`/`BRAND_ICON_VIEWBOX` (`assets/brandSvg.js`).

**Centre "line" removed (2026-06-29):** the vertical **satin ribbon band** running top-to-bottom through the centre (behind the seal) was deleted (mesh + material + its `applyVisual` lines) — on white it read as an unwanted line bisecting the envelope. The seal-crack, flap pivot, sparks and card rise are untouched (none depended on it).

**Other 2026-06-29 page-level polish (non-envelope, still in place):**
- **Tighter section spacing** (~⅓ less: `.dawa-inv-section` 96→64px, section-head gap 56→36, story/details gaps trimmed) and a **subtle global Arabic letter-spacing** `.4px` on `.dawa-inv`.
- **Wedding date moved under the countdown** (`InviteCountdown` gains a `dateText` prop); the Hero chip shows venue only, falling back to the date when the countdown is hidden.
- **Floating section-nav menu** (`sections/InviteNavMenu.jsx`) — a collapsed pill expanding to the enabled sections (same `show*` flags) with smooth-scroll + IntersectionObserver scroll-spy; hidden until the guest scrolls past the hero. Every section gained an `id` anchor.

## Round-two spacing tightening + central tokens (2026-06-30)
A second pass to make the public scroll meaningfully shorter — most on mobile, where ~all
guests open it. Three cross-cutting spacing levers were lifted out of scattered literals into
**central CSS custom properties on `.dawa-inv`** (the first spacing *tokens* in the invite):
- `--inv-sec-pad: clamp(30px, 5vw, 48px)` — section vertical padding (was a flat `64px`). The
  `clamp()` makes the between-section rhythm **fluid**: ~30px on a 390px phone → 48px on desktop,
  matching the existing fluid-font pattern. Used by `.dawa-inv-section` **and** the footer top.
- `--inv-head-gap: clamp(20px, 3.5vw, 28px)` — `SectionHead` bottom margin (was `36px`, inline in
  `inviteShared.jsx`, now `var(--inv-head-gap)`).
- `--inv-foot-bottom: 64px` — footer bottom (was `96px`).

Plus in-place Compact trims to the one-off internal gaps (details grid `40→28`, story item
`36→26`, venue `32→24`) and the growth byline bottom (`96→72`, still clears the fixed dock). The
**hero** kept its full-bleed cover but switched `min-height: 100vh → 100svh` (so it's exactly one
*visible* screen on mobile instead of overflowing below the chrome-hidden viewport) with padding
`60→48`. Tune density centrally via the three `--inv-*` vars. Files:
`sections/InviteStyles.jsx`, `inviteShared.jsx`, `DigitalInvitationView.jsx`. Verified via
Playwright MCP at 390px + 1280px (tokens resolve 30/48px; no cramping or dock overlap). See
[[Visual-Design-System]], [[Architecture-Decisions]].

**Fallback policy (unchanged) — see [[Architecture Decisions]]:**
- The envelope is **WebGL-only** (the old 2D wax-seal `EnvelopeIntro` was deleted). `useDeviceCapability`: only reduced-motion / data-saver / no-WebGL force tier 0 (→ **no envelope**, straight to content over the CSS ambience floor); **software GPUs and in-app browsers attempt the 3D** at capped tier 1. The envelope **never downgrades during the reveal** (the FPS guard is skipped while `mode !== "scroll"`); a genuine WebGL context-loss still bails to the CSS floor.
- **Demo** (`?demo=1`) always replays and never persists the global `dawa-invite-opened` flag (threaded via a `demo` prop `DigitalInvitationPage → DigitalInvitationView → CelestialAmbience`); demo default theme is `ivorygold` (override via `?theme=`). The shared gate also enriches the landing hero ([[Visual Design System]]).

## A persistent source of bugs
The digital dashboard's upload + gallery flows generated most of the project's bugs because the UI reads from a 15s poller and multiple uploads race on a shared `media[]` array. See [[Optimistic UI Pattern]] and [[Known Bugs]] (BUG-O002, BUG-O003, BUG-R011, BUG-R012). Fixes: Firestore transactions for read-modify-write, optimistic local updates, pending-paths merge against poll results, resumable GCS uploads, and `getDownloadURL` instead of signed URLs.

## Premium 3D envelope reveal (2026-06-26)
The guest-facing intro on `/d/:groomUsername/:token` is a cinematic 3D envelope, **rebuilt to run inside the shared celestial particle scene** (one WebGL renderer — see [[Architecture Decisions]]). Imported from a Claude Design project (`Landing.dc.html` / `envelope3d.js`), it replaced the old flat-plane envelope:
- **Look** — matte fiber-dyed cardstock, gold filigree edges, a glossy wax seal bearing the couple's monogram, and a cream gold-foil invitation card with baked Arabic **and** Hebrew calligraphy (names + blessing + welcome + date). It floats *in* the starfield; on open the seal fractures (gold-spark burst), the flap pivots 180°, the card rises, the camera pushes in, then the card dissolves into light and the camera glides back into the same starfield onto the DOM invitation hero (`localStorage dawa-invite-opened` skips it on return visits).
- **Engine split** — `celestial/envelopeMesh.js` (full rewrite) owns the geometry/PBR materials/bursts and `setOpen(t,fov,aspect)→{y,z,lookAtY}` (all visual sub-easings + a returned camera pose); `celestial/celestialEngine.js` owns the ~4.8s clock, applies the pose, drives a telephoto `ENV_FOV=34` during the reveal (lerps back to 62 on glide), and enables ACES tone-mapping + AA on the shared renderer **only when an envelope is present** (the particle `ShaderMaterial` is pinned `toneMapped:false`, so non-envelope pages are byte-identical). The runtime FPS guard is suppressed during the reveal (the tier gate protects weak devices instead).
- **Gating** — `CelestialAmbience` runs the premium 3D reveal only on device **tier ≥ 2**; tier-1 keeps the particle backdrop but gets the lighter 2D `EnvelopeIntro`; no-WebGL / reduced-motion get the 2D floor + 2D envelope. The scroll-lock releases if WebGL is torn down mid-reveal (reduced-motion toggle / context-loss).
- **Per-theme recolor** — `utils/themeToEnvelopePalette.js` derives the whole envelope palette (paper/wax/foil/foilBright/cardPaper/cardInk) from the chosen theme with **contrast clamps** so the card calligraphy stays legible on light *and* dark themes.
- **New authorable fields** — `blessing` + `welcome` (`{ar,he}`), edited in `DigitalDesignEditor`, allow-listed in the strict backend `sanitize.ts` + `DESIGN_FIELDS`, flow onto tokens via the existing `...designFields` snapshot spread, and render on the card (3D) and the 2D fallback only — not the hero/sections.

## Envelope luxury redesign + brand seal (2026-06-27)
A pure render/style upgrade (no DB/schema/snapshot change — the envelope is drawn live from code + the token's `themeColor`, so all existing invites adopt it). Decisions (grilled): replace the couple monogram on the seal with the **دعوة brand logo**; make the wax + paper **theme-derived jewel tones, not black**; add an arabesque flap + silk lining + ribbon; keep parity with the 2D fallback.
- **Brand seal** — `makeSealTex` in `celestial/envelopeMesh.js` now stamps the gold دعوة mark (deboss shadow + vertically-graded foil face) instead of the monogram. Drawn **natively via `Path2D`** from new `BRAND_ICON_PATHS` (exported from `assets/brandSvg.js` by regex-extracting the icon's `d` strings) — **no `<img>` load, so the seal canvas stays origin-clean and the WebGL texture upload can't throw a taint `SecurityError`**. The disc gradient is derived from `pal.wax` (lit centre → darkened rim).
- **Jewel-tone palette** — `utils/themeToEnvelopePalette.js`: dark-theme `paper` and `wax` bands raised + pulled toward the accent (`paper = clampLum(mix(bg,accent,0.34),0.05,0.17)`, `wax = clampLum(mix(accent,NEAR_BLACK,0.34),0.12,0.34)`). Light themes + the contrast-locked `cardPaper`/`cardInk` are untouched (calligraphy legibility invariant intact).
- **Surfaces** — gold-foil **arabesque** (8-point girih lattice, `makeArabesque()`, deterministic) on the flap as `map`+`metalnessMap`+`roughnessMap` (foil lattice = the smooth metallic part), an inset gold border LineLoop, a **satin silk lining** (`MeshPhysicalMaterial` `sheen`) with a faint gold arabesque, a **woven-linen** roughness grain, and a **satin ribbon** band that fades+slides away mid-fracture (gone by ~T=0.37, before the flap pivot at 0.35 — no overlap). Lighting deepened + a theme-foil back-rim; burst shockwave/flare tinted to `pal.foilBright`.
- **Gotcha fixed in review** — the seal material must use `color:0xffffff` (like `cardMat`/`flapMat`), NOT `col(pal.wax)`, because `sealTex` already bakes the wax tone; setting both **double-multiplies** (`albedo = color × mapTexel ≈ wax²`) and crushes the disc back toward black. Caught by the adversarial review workflow.
- **2D fallback parity** — `sections/EnvelopeIntro.jsx` renders `BRAND_ICON_SVG` in `.dawa-inv-wax`; `sections/InviteStyles.jsx` gives the wax a jewel radial-gradient + gold border and the envelope card a gold border + inset glow (`ON_GOLD` import dropped).
- **Verified** via a temporary `buildEnvelope` render harness driven by Playwright MCP (gold/emerald sealed, gold open showing the silk lining, champagne light theme, and the 2D fallback) — full-emulator + headless-WebGL token path was too flaky, so the harness rendered the real code at chosen reveal frames. See [[Architecture Decisions]].

## Per-design custom background (2026-06-30)
Grilled + built. The public invite now supports a fully groom-customizable 2D backdrop, alongside the existing 3D celestial world. Stored as one new design field `background` (mirrors the `envelope` override object) at `digitalInvitations/{uid}/designs/{designId}.background`; auto-reaches guests because it's in `DESIGN_FIELDS` → `PUBLIC_DESIGN_FIELDS`.
- **Decisions (grilled):** keep the 3D world as default; a per-design **"Use my background"** toggle (`background.enabled`) flips THAT invitation to the custom 2D backdrop for ALL guests (no 3D world), with the WebGL envelope intro still playing then **fading out** to reveal the custom backdrop (accepted: 3D briefly visible around the envelope during the reveal). Circles = **global** controls (count 0–6, **one** colour, size, opacity, softness, motion on/off), auto-placed **on the edges, never the centre**. Fill = solid colour OR two-colour gradient. Background **image** = fills screen, fixed, adjustable dark overlay, circles on top (count 0 = image-only). Petals + sparkles kept, each toggleable.
- **Data shape (flat, like `envelope`):** `{ enabled, color, gradient, gradientFrom, gradientTo, image:{url,storagePath,kind}|null, imageOverlay, circleCount, circleColor, circleSize, circleOpacity, circleSoftness, circleMotion, petals, sparkles }`. Sliders are 0..1 (renderer maps to px/vmin). `image` is **server-managed only** — set by the upload route, **stripped from client PATCH** in `sanitizeBackground` (no client-supplied URLs).
- **Backend:** `sanitizeBackground()` in `sanitize.ts` (clone of `sanitizeEnvelope` — hex validate, clamp, bool-coerce, strip image); `"background"` added to `DESIGN_FIELDS`; `media.routes.ts` upload/delete gained a `target=background` branch that replaces a single `background.image` via `set({background:{image}},{merge:true})` deep-merge (and best-effort deletes the prior storage object). No rules change.
- **Frontend:** `utils/themeToBackground.js` `resolveBackground(theme, overrides)` (theme defaults: fill←`theme.bg`, circle colour←`theme.accent`); `InviteAmbience.jsx` `Ambience` gained a `background` branch (fill/image/overlay + edge-centred circles); `CelestialAmbience.jsx` custom-bg branch (2D backdrop base + WebGL envelope on a z-999 wrapper that fades opacity→0 on `phase==="done"` then unmounts at `"gone"`); threaded `background` through `DigitalInvitationView`; new "الخلفية المخصّصة" editor `<Section>` + `BackgroundPreview` (live 2D, reuses `ViewStyles`) in `DigitalDesignEditor.jsx` (so the admin demo editor gets it too via `DesignEditorBody`).
- **Two gotchas fixed during browser verify:** (1) circles sized in `vmin` looked right only at full viewport — switched to **`cqmin` with a `vmin` fallback** + `container-type:size` on the aurora so they scale to their container (correct in the small editor preview AND the public page); (2) the inner circle `<span>` was `display:inline` so `width/height:100%` were ignored and it painted nothing — fixed with `display:block`. Centre-clarity guaranteed by **centring each circle exactly on an edge point** (translate on the sized anchor) so the visible glow never reaches the centre at any size.
- **Verified** (bundled-Chromium, MCP needs system chrome): demo default path unchanged (0 console errors); editor Background section + live preview drive cyan edge-circles with a provably clear centre (`centreCovered:0`, `visible:6` at box AND full-viewport scale); persistence round-trips. New unit tests: `digitalBackgroundSanitize.test.ts` (backend), `themeToBackground.test.js` (frontend), + a `background` assertion in `digitalPublicProjection.test.ts`. See [[Architecture Decisions]].

## Seal compass-star toggle + Arabic cursive-join fix (2026-07-01)
Two grilled tweaks (pure render/CSS + one new persisted design field). Verified end-to-end via Playwright MCP on the emulator (groom `Groom1234`).

- **Seal compass star is now OFF by default + toggleable.** The wax seal had *two* independent stars: the **arabesque lattice** across flap/shell (long-standing `stars`/`starDensity`/`starIntensity` controls) and a faint **8-point "compass" star debossed behind the gold دعوة emblem on the seal disc** (`makeSealTex` in `celestial/envelopeMesh.js`), which was always drawn with no control. Grilled decision: **remove the seal star by default** for everyone, add a **separate** toggle to opt back in (the دعوة emblem always stays; only the star deboss is gated).
  - New per-design override field **`envelope.sealStar` (boolean, default OFF)** — rides the existing `envelope` override object (same pipeline as `stars`). `resolveEnvelopePalette` (`utils/themeToEnvelopePalette.js`) resolves it as `sealStarEnabled: o.sealStar === true`; `makeSealTex` guards its two `star(...)` fills behind `if (pal.sealStarEnabled)`. Existing invitations (no `sealStar`) therefore render the seal **without** the star immediately.
  - **Backend:** `sanitizeEnvelope` (`api/routes/digital/sanitize.ts`) whitelists `sealStar` as a boolean (mirrors the `stars` block; non-boolean → `invalid_toggle`). This is the ONLY persistence gate — `database.rules.json` does not `.validate` the `envelope` object. Without this the toggle value is silently stripped on save.
  - **UI:** new `ToggleRow` "نجمة على الختم" / "כוכב על החותם" (`testid design-env-seal-star`) in the "المظروف ثلاثي الأبعاد" section of `DigitalDesignEditor.jsx`, beside the arabesque-stars toggle. `EnvelopePreview` re-resolves the palette, so the live 3D preview reacts. The star is a monochrome deboss (no colour control) — purely on/off.
  - **Tests:** `themeToEnvelopePalette.test.js` (default false / true only when `=== true`) + `digitalEnvelopeSanitize.test.ts` (round-trips boolean, rejects non-boolean).

- **Arabic letters now join in the scrolling invitation.** Root cause: heavy CSS `letter-spacing` (eyebrows 4px, labels/cues 2.8–3px, plus the `.4px` global base — see the 2026-06-29 note above) pries apart Arabic's cursive joins so words render as disconnected glyphs. That wide tracking is a **Latin/Hebrew** flourish (uppercase eyebrows) with no benefit for Arabic. **Language-scoped fix:** `DigitalInvitationView` now sets **`lang={lang}` on the `.dawa-inv` root** (both AR & HE are RTL, so `dir` can't distinguish them — `lang` can); `sections/InviteStyles.jsx` appends `.dawa-inv[lang="ar"] …{ letter-spacing: normal }` rules (specificity 0,3,0 beats the per-element 0,2,0 without `!important`) covering the eyebrow/label/name/foot classes + the base. **Hebrew keeps every tracking value** (flip `lang` to `he` → 4px/3px/.4px return). Verified: computed `letter-spacing` is `normal` under `lang=ar`, original under `lang=he`; Arabic preview renders joined ("يتشرفون بدعوتكم،", "دعوة شخصية").
  - **Build gotcha (caught by browser verify):** backtick characters inside a CSS comment **inside the `` `…` `` template literal** in `InviteStyles.jsx` prematurely close the template string → Vite `Unexpected token` parse error. Keep template-literal CSS comments backtick-free.

See [[Visual-Design-System]], [[Architecture-Decisions]].

## Always-open section-nav column + merged صورك (2026-07-01)
Grilled + built (pure presentational; no schema/rules/data change). The public invitation's
navigation was reworked from a tap-to-open hamburger into a single always-visible vertical column.
- **Decisions (grilled):** ONE always-open column pinned **top-right** (`insetInlineStart:14`, RTL →
  right edge); **صورك on top** as the first row; then the enabled section links. **Colorful emoji**
  next to every button (⬆️القصة📖 الصور🖼️ التفاصيل📋 المكان📍 العدّ⏳ تأكيد✅ التهاني💌 هدية🎁, صورك📸) —
  chosen over monochrome glyphs for recognizability + consistency with the app's existing emoji. صورك
  is the **only framed** button, framed in **`theme.accent`** (matches the palette, not hard-coded
  gold). **No background fill** on any button (removed the frosted `theme.overlay` menu card, صورك's
  `theme.chipBg`, and the active `theme.accentMuted` fill). Column is **visible the whole time**
  (removed the scroll-past-hero reveal gate); it still sits at z-index 120 < envelope overlay 1000, so
  it stays hidden behind the 3D-envelope intro and never fights it.
- **Implementation:** `sections/InviteNavMenu.jsx` rewritten — dropped `open`/`visible` state, the
  hamburger button, the outside-tap/Escape dismiss effect and `useRef`; kept the `IntersectionObserver`
  scroll-spy driving `active`. New nullable prop `sorek={label,icon,onClick}` renders the framed first
  row. Active row = accent color + weight 800; inactive = `theme.textSoft` + 600; a subtle
  `textShadow` preserves legibility with no fill. `DigitalInvitationView.jsx` added an `icon` per
  `navItems` entry, removed the standalone `<SorekButton/>` render, and passes `sorek` into the nav
  menu (same visibility gate the old button had). The now-unused **`SorekButton`** was deleted from
  `inviteShared.jsx` (and its stale mention in `WalletButton.jsx`'s header comment cleaned up).
- **Verified** via Playwright MCP on the demo (`/d/demo/demo?demo=1`): column is `position:fixed`,
  14px from the right, transparent background, always visible; صورك has `1px solid` accent border +
  transparent bg (the only framed button); section rows have no border/bg (active bold+accent);
  clicking a row smooth-scrolls (0→3591px to المكان); AR↔HE toggle localizes all labels and keeps the
  frame on accent. Adversarial multi-lens code review found no surviving correctness/theme bugs.

## DECIDED, not built: editable RSVP + change log (2026-07-02)

Owner decision from the live interview in [[UX Research Discovery 2026-07-02]]: the current
**one-shot RSVP** (a guest cannot view or change an answer after submitting) will become
**editable until a deadline the couple controls, with a change log the couple sees** — so
headcounts never silently shift. Chosen over "admin reset only" and "keep one-shot".
Needs its own design + explicit go-ahead before building (token semantics, `digitalGuests`
schema, RTDB/Firestore rules, notification surface). Until then, usability task G4 in
[[Usability Test Plan 2026-07]] measures how guests behave when they hit the current wall.

### Follow-up: icon-only circles with reveal-on-demand names (2026-07-01)
Same session, second grilled pass. The labelled column was tightened into **icon-only circular
buttons** — every emoji now sits in a **44px transparent circle** (`border-radius:50%`) and the names
are **hidden by default**, revealed as a floating pill only when relevant.
- **Decisions (grilled):** reveal = a **tooltip pill** to the inner (left, RTL) side of the circle,
  not an inline expansion; **rings** = faint `theme.accentLine` on section circles, bolder
  `theme.accent` on صورك **and** on the active section (a "you are here" ring); revealed label sits on
  a **frosted chip**. A name shows when `id === active` (scroll-spy) **OR** `id === hovered`
  (pointer/focus). صورك has no section so its name reveals on hover/press/focus only.
- **Implementation (single file, `InviteNavMenu.jsx`):** added a `hovered` state OR'd with the existing
  `active`; `renderCircle()` (a plain function, not a component, to avoid remount-on-hover) draws the
  circle + an absolutely-positioned pill (`insetInlineEnd: calc(100%+8px)`, `opacity` toggled). Hover
  wired via `onPointerEnter/Leave` + `onFocus/Blur` (pointer events cover mouse *and* touch-press; a
  section tap also scrolls → becomes `active` → its pill persists). `aria-label` on each circle keeps
  the name for screen readers. Scroll-spy + `go()` kept verbatim. صورك uses a synthetic id `"__sorek"`.
- **Post-review hardening (adversarial workflow):** (1) pill text switched from `theme.accent` to
  **`theme.overlay` bg + `theme.text`** — the palette's designed-for-legibility pair — because
  accent-on-`chipBg` failed WCAG AA on light themes (champagne measured **2.3:1 → 12.55:1** after the
  fix); (2) a guard effect clamps `active`/`hovered` to valid ids when `items` shrinks (the groom
  toggling a section off in the **editor preview** really does change `items`); (3) pill got a
  `max-width` + ellipsis cap. Dismissed as non-issues: `__sorek` id collision (ids are controlled
  `inv-*`/`rsvp`), RTL scrollbar occlusion (≤10 circles never overflow a phone height), touch
  "180ms vanish" (section names re-appear via the active state after the tap scrolls there).
- **Verified** via Playwright MCP on the demo (gold + champagne themes): 44px transparent circles,
  faint vs bolder rings, only the active pill shown by default, hover reveals just that one while the
  active stays, click scrolls + updates the "you are here" pill, صورك reveals on hover, AR↔HE
  localizes pills, and the champagne-theme pill contrast measures 12.55:1. Build passes; the 42 failing
  unit tests are **pre-existing** (tokenManager/storage/forgotPassword/groomPortal — confirmed failing
  at HEAD with all changes stashed), unrelated to this presentational change.

### Follow-up: صورك name is always visible (2026-07-09)
Owner request: guests shouldn't have to tap/hover the صورك circle to see its word — the
label should stay visible at all times. **One-line, scoped change** in `InviteNavMenu.jsx`:
the pill-visibility flag became `const show = isSorek || isActive || isHover` (was
`isActive || isHover`). Only the صورك circle (`isSorek: true`) is forced always-on; every
section circle keeps the reveal-on-demand behaviour (name shown only while active or
hovered). No schema/rules/data change; purely presentational. Because the same
`InviteNavMenu` renders under both `mode="public"` (the real sent-to-guests invitation)
and `mode="preview"` (the النموذجية sample / groom editor / admin demo), the single change
covers all of them. **Verified live** (headless Playwright on `\d\demo\demo?demo=1`, MCP was
down so a standalone script was used): صورك label `opacity:1` at rest; القصة/الصور/التفاصيل/
المكان/العدّ/تأكيد/التهاني all `opacity:0` at rest (الأعلى shows only because it's the active
section at page-top — unchanged scroll-spy behaviour). Deployed (hosting + `digitalInvitePreview`).

See [[Visual-Design-System]], [[Architecture-Decisions]].

## Couple-name connective → "&" across all surfaces (2026-07-03)
Owner request (scope confirmed: "everywhere incl. the WhatsApp share"). The connective between the
groom + bride names changed from the localized **"و"** (Arabic) / **"ו"** (Hebrew) to a
**script-neutral "&"** on every surface that renders the couple:
- **Envelope reveal card** (WebGL, both the AR *and* HE baked lines) + **hero couple title** —
  `DigitalInvitationView.jsx` (`namesAr`/`namesHe` now `join(" & ")`) and
  `sections/InviteHero.jsx` (the `.dawa-inv-amp` span, previously `lang === "he" ? "ו" : "و"`). The
  monogram already joined initials with "&", so it's now consistent.
- **WhatsApp share** — `backend/functions/src/digitalOgImage.ts` (OG image couple line,
  `join("   &   ")` — verified the "&" glyph renders cleanly in the Amiri font) and
  `digitalInvitePreview.ts` (og:description couple, `join(" & ")`).
Verified live on `/d/demo/demo` (hero **"كريم & ليلى"**, bundle `index-ZA0WrUxc.js`) and via a direct
`renderOgImage` render of the deployed function (OG card **"كريم & ليلى"**).

**Deploy gotcha discovered (important, latent):** `firebase deploy` runs the **functions** predeploy
(`backend/scripts/build-functions.cjs`) *before* the **hosting** predeploy (`build-vite.cjs`), and
build-functions copies `frontend/dist/index.html` into the function (`digitalInvitePreview` /
`digitalOgImage` serve it to inject OG tags). So when `dist` is stale, those functions serve a
**one-build-old SPA shell** pointing at the *previous* JS bundle — the first deploy this session left
the live `/d/**` page loading the old "و" bundle even though hosting had the new one. **Workaround
used:** run `npm run build` (frontend) *before* `firebase deploy` so `dist` is already the final
bundle (Vite content-hashing is deterministic → the hosting rebuild reproduces the exact hash the
function bundled, keeping function + hosting consistent). Also: the deploy service-account key lacks
`cloudscheduler.jobs.update`, so a **full** `firebase deploy` 403s on the 6 scheduled functions —
deploy `--only hosting,functions:digitalInvitePreview,functions:digitalOgImage` for invite changes.
Both filed in [[Tasks-Backlog]]. See [[Architecture-Decisions]].

## Envelope مكتوب now replays on EVERY open — global "opened" flag removed (2026-07-03)
**Bug (owner-reported):** a sent digital invitation didn't show the sealed مكتوب intro when the guest
opened it — it went straight to the invitation. **Root cause:** the envelope was gated by a **single
global** localStorage key `dawa-invite-opened` (`CelestialAmbience.jsx`) — once **any** digital
invite was opened on a device, `readOpened()` returned true and
`doEnvelope = showEnvelope && !opened && …` suppressed the envelope on **every** subsequent invite.
The demo appeared to work only because `DigitalInvitationPage` reset the flag to `"0"` on mount; real
invites never reset it. So a groom opening one link to test hid the مكتوب on all the others (and any
device that opened a prior invite).
**Fix (owner decision: replay on every open):** removed the flag mechanism entirely —
`OPENED_KEY`/`readOpened()`/`markOpened()` deleted, `opened` is now `useState(false)` (never
persisted), the now-unused `demo` prop threaded out of `CelestialAmbience` + `DigitalInvitationView`,
and the dead demo-reset block dropped from `DigitalInvitationPage`. Each guest always sees the sealed
مكتوب before it opens; re-opening the same link replays it. The device-capability gate is unchanged —
the envelope still only renders on WebGL-capable devices and only when the design's
`envelopeEnabled !== false` (a groom who toggled the envelope off in their editor still has none).
**Verified live** on `/d/demo/demo` with `dawa-invite-opened=1` pre-set (the exact bug trigger): the
sealed envelope still appears (bundle `index-BK7dNB6-.js`), opening completes to the invitation, and
no flag is written afterwards. See [[Architecture-Decisions]].

## WhatsApp share preview — shorter title + groom-authored description (2026-07-03)
Two owner-requested changes to the `/d/**` link preview (OG tags served by `digitalInvitePreview`):
- **Title:** `دعوة زفاف — <guest>` → **`دعوة — <guest>`** (dropped the word "زفاف"). Empty-guest
  fallback `دعوة زفاف` → `دعوة`. `digitalInvitePreview.ts`.
- **Groom-authored description:** new **bilingual design field `shareMessage`** — whatever the groom
  types in the editor becomes the `og:description`, with the wedding date **auto-appended**
  (`<shareMessage> — <date>`, owner's chosen behaviour). Empty → the previous auto line
  (`<couple> يتشرّفون بدعوتكم لحضور حفل زفافهم — <date>`). The field is **NOT rendered on the
  invitation page** — only in the WhatsApp link preview.
- **Pipeline:** `shareMessage` added to `DESIGN_FIELDS` (`constants.ts`) → auto-included in
  `PUBLIC_DESIGN_FIELDS` and the mint-time `designSnapshot` (which spreads the full design doc, see
  [[#API]]), so it reaches the token `digitalInvitePreview` reads; sanitized as a localized scalar
  (`sanitize.ts`, max 300, bilingual `{ar,he}` clamp); editor input in `DigitalDesignEditor.jsx` —
  new "وصف الرابط على واتساب" `<Section>` (`data-testid design-share-message`, uses the shared
  `textProps` leaf-binding). Deploy targets: `hosting,functions:api,functions:digitalInvitePreview`.
- **Verified live** via a throwaway prod invite token (written with the admin SDK, curled, then
  deleted): `og:title = "دعوة — أحمد محمد"`, `og:description =
  "أفراحنا لا تكتمل إلا بوجودكم — 19 أغسطس 2026"` (custom message + auto date). Save path unit-verified
  (`sanitizeMediaSettings` accepts/clamps the bilingual field). The editor field itself was **not**
  browser-verified — the emulator needs Java 11+ and only Java 8 is installed here, and there are no
  prod groom creds; it follows the identical, working blessing/welcome field pattern. See
  [[Architecture-Decisions]].

## Faster first paint + no content flash before the مكتوب (2026-07-03)
Two owner-reported load-experience bugs on the public `/d/:groomUsername/:token` page.

**Problem — long "جاري التحميل" spinner.** The page blocked on a client round-trip to
`GET /invites/token/:token` (the `api` function, cold-start-prone) before rendering anything.
**Fix (owner picked the free option): server-embed the invite record.** `digitalInvitePreview`
already reads the token (for OG tags), so it now also inlines the guest+design record — the SAME
public projection as `GET /invites/token` (guestName, guestPhone, guestType, groomUsername,
expiresAt, usedAt, designId, designSnapshot; the derived boardingPassEnabled/eventStatus are left
to the poller). `DigitalInvitationPage` seeds `tokenRec` **and** `doc` from it in the `useState`
initializers (`readEmbeddedInvite`), so the personalized invitation + envelope render on **first
paint** with no spinner; the existing poller still refreshes it.
- **CSP gotcha (caught in browser verify):** the first cut inlined an executable
  `<script>window.__DAWA_INVITE__=…</script>`, which the strict CSP (`script-src` has **no**
  `'unsafe-inline'`) blocked — the script never ran. Fix: inline an **inert
  `<script type="application/json" id="__DAWA_INVITE__">` data block** (not executed → not subject
  to `script-src`), read via `getElementById(...).textContent`. Payload is `encodeURIComponent`-d so
  it can't break out of the tag. There is **no** new exposure — the same fields are already public to
  any token holder via `/invites/token`, and the HTML is cached per-token-URL.
- **Verified live** (throwaway prod token): the data block parses (guest "سامي خليل", theme
  "emerald"), the sealed envelope renders themed with the guest name, and — decisively — while the
  token poller was returning **429** (rate-limited by repeated test loads) the page **still rendered**
  from the embedded data. So first paint no longer depends on the `api` round-trip.

**Problem — the invitation flashes for ~1s before the مكتوب.** The 3D envelope is a lazy 535 KB
WebGL chunk; the ambience floor sits at `z:0` behind the content, so until the chunk loaded the
invitation content showed through the (mostly transparent) sealed overlay, then the canvas (`z:999`)
covered it. **Fix:** while the envelope is active, the `Suspense` fallback is now an opaque
`EnvelopeBootCover` (`z:998`, `theme.bg`) instead of the transparent `Ambience`, and the
`CelestialCanvas` container paints an opaque `theme.bg` while `elevated` — so the sealed-envelope
backdrop shows from the first frame and the content never flashes. Both the normal-world and
custom-background branches covered (`CelestialAmbience.jsx` + `CelestialCanvas.jsx`).
Deploy: `hosting,functions:digitalInvitePreview`. See [[Architecture-Decisions]].

## Wedding time — datetime picker, countdown to the hour (2026-07-04)
Owner request: let the groom set an hour (not just a day) so the countdown targets the exact time and
the time shows next to the date. **No schema change** — `weddingDate` is still a single number (epoch);
it just now carries the hour.
- **Editor** (`DigitalDesignEditor.jsx`): the wedding-date input is now `type="datetime-local"` (day +
  hour). `epochToInput`/`inputToEpoch` round-trip `"YYYY-MM-DDTHH:MM"` via the browser's local time
  (the groom is in the venue's timezone).
- **Countdown** (`InviteCountdown.jsx`): unchanged — it already targets the epoch to the second, so it
  counts to the exact hour automatically once the epoch carries the time.
- **Display**: date + **24h** time (e.g. `19 أغسطس 2026 · 19:30`) with **Western digits** on the
  invitation (`DigitalInvitationView` `formatWeddingDateTime`), the WhatsApp OG image
  (`digitalOgImage.ts`), and the OG description (`digitalInvitePreview.ts` `formatDate`). All three
  format in a **fixed venue timezone `Asia/Jerusalem`** (DST-aware) so every guest sees the couple's
  real local time regardless of where they open the link; Cloud Functions run in UTC, so the explicit
  zone is required. Legacy date-only designs sit at UTC midnight → detected
  (`getUTCHours()===0 && getUTCMinutes()===0`) → shown date-only.
- **Deploy gotcha (important):** OG images are pre-rendered at token mint by the **`cacheInviteOgImage`**
  onCreate trigger (Storage `og-cache/{token}.jpg`) — a SEPARATE function from `digitalOgImage`. The
  first deploy shipped only `digitalOgImage`, so freshly-minted links still cached the OLD (timeless)
  image (served on cache hit). Fix: also deploy `cacheInviteOgImage`. **Full targets for any OG-image
  change:** `hosting,functions:digitalInvitePreview,functions:digitalOgImage,functions:cacheInviteOgImage`.
- **Verified live** (throwaway token, 19:30 IDT): invitation countdown line `"19 أغسطس 2026 · 19:30"`,
  `og:description` `"… — 19 أغسطس 2026 · 19:30"`, and the OG image renders the time; DST checked (Aug
  19:30 IDT vs Jan 20:00 IST). Editor input itself not browser-verified (auth-gated; emulator needs
  Java 11+, only Java 8 here). See [[Architecture-Decisions]].

## Reliable photographer album upload — bounded queue + retry + higher cap (2026-07-04)
Owner-reported: uploading a photographer's event album (before publish, the [[Face Matching]] "صورك"
source) took forever and **failed on many photos**. Three causes, all fixed — **full resolution kept**
(owner declined downscaling: "keep it until you find a solution").
- **Frontend fired every file at once** (`DigitalPhotographer.jsx` `handleFiles` used one
  `Promise.allSettled(arr.map(...))`). The browser runs only ~6 sockets/host, so the rest queued — and
  each queued XHR still counted down its **2-min upload timeout while WAITING** → mass `request_timeout`
  failures on big albums. **Fix:** `runUploads()` — a **bounded-concurrency queue** (`UPLOAD_CONCURRENCY
  = 4`) so only a few XHRs are ever live, with **per-file retry** on transient (timeout/network)
  failures (`UPLOAD_MAX_ATTEMPTS = 3`, 500ms×attempt backoff; permanent errors like 413/429 are NOT
  retried). Returns Promise.allSettled shape, so the optimistic-merge/toast code is unchanged. Progress
  UI now shows an **"X / N" counter** instead of a chip per file (hundreds of chips was unusable).
- **Per-user cap was 120 uploads/hour** (`PHOTOG_UPLOAD_PER_USER = perHour(120)`, `rateLimits.ts`) →
  429 after 120 photos; a wedding album is routinely many hundreds. **Fix:** raised to `perHour(2000)`
  (sized for a full-event dump, still bounds abuse). `MEDIA_UPLOAD_PER_USER` (background/hero, few
  files) left at 120.
- **Each file is still a multipart POST through the `api` Cloud Function** (browser→function→GCS), not a
  direct-to-Storage resumable upload — the remaining speed ceiling. Noted for a future pass; the
  queue+retry+cap already make big albums RELIABLE at full quality.
Deploy: `hosting,functions:api`. The concurrency+retry algorithm was verified by a standalone sim (peak
concurrency ≤ 4, transient files recover via retry, permanent errors reject, order preserved); the live
upload UI is auth-gated (groom login; emulator needs Java 11+, only Java 8 here) so not browser-verified.
See [[Face Matching]], [[Architecture-Decisions]].

## Background-star controls + stale-demo-envelope fix (2026-07-04)
Two owner requests on the 3D scene.

**Bug — the مكتوب stayed on the OLD design after the admin edited + re-published the demo.** The WebGL
envelope is built ONCE at `CelestialCanvas` mount (config captured in a ref; the create-effect has an
empty dep array). The demo page first paints the built-in fallback design, then an effect swaps in the
admin-published design — but the envelope never re-baked, so it stayed frozen on the fallback while the
DOM invitation updated. **Fix:** the engine gains `rebuildEnvelope(next)` (`celestialEngine.js`) that
disposes + rebuilds the sealed envelope, guarded to `mode === "envelope"` (never mid-open); `liveEnvelope`
is now mutable. `CelestialCanvas` adds an effect keyed on the serialized envelope config that calls it on
a real change (first run skipped — the engine already built it at mount). Verified: toggling AR↔HE on the
sealed demo (a real content change) re-bakes cleanly (sealed survives, `glError 0`).

**Feature — per-design control of the 3D BACKGROUND starfield** (the celestial particle motes, NOT the
envelope arabesque stars — owner explicitly picked the background field): **colour, size,
clarity/opacity**.
- **Data:** new `starfield` design object `{ color?, size?, opacity? }`. `sanitizeStarfield`
  (`sanitize.ts`: hex colour + `STARFIELD_SIZE 0.4–2.5` + `STARFIELD_OPACITY 0–2`, clamp-never-reject),
  added to `DESIGN_FIELDS` → flows via `designSnapshot` / `PUBLIC_DESIGN_FIELDS`.
- **Render:** `themeToUniforms(theme, starfield)` merges the override (a colour paints core+halo; size +
  opacity are shader multipliers, default 1 = theme baseline). Particle shader (`particles.glsl.js`)
  gains `uStarSize` (VERT, multiplies `gl_PointSize`) + `uStarOpacity` (FRAG, multiplies alpha); the
  engine adds the two uniforms + applies them in `setTheme`. Threaded `DigitalInvitationView →
  CelestialAmbience → CelestialCanvas`. The celestial motes were previously theme-derived ONLY.
- **Editor:** new "نجوم الخلفية" `<Section>` (`design-star-color` / `design-star-size` /
  `design-star-opacity`) mirroring the envelope colour/slider pattern via new `setStarField` /
  `bufferStarField` / `commitStarField`; the admin demo editor reuses the same `DesignEditorBody`.
- **Verified live** (throwaway prod token): a `{color:"#3bd6ff", size:2.2, opacity:2}` override rendered
  big, bright CYAN background stars (`glError 0`); the shader compiles + the envelope still opens.
Deploy: `hosting,functions:api,functions:digitalInvitePreview`. Editor UI itself not browser-verified
(auth-gated; emulator needs Java 11+). See [[Visual-Design-System]], [[Architecture-Decisions]].

### Follow-up: live starfield preview under the controls (2026-07-09)
Owner: "when I edit the background stars, show me an example of how it'll look before I publish."
The star `<Section>` had colour/size/clarity sliders but — unlike the envelope section (`EnvelopePreview`)
and the background section (`BackgroundPreview`) — **no preview**. Added `StarfieldPreview`
(`DigitalDesignEditor.jsx`, `testid design-star-preview`): a 220px framed panel that mounts
`CelestialCanvas` in `mode="preview"` with **no envelope** (so the particle field fills the frame and is
clearly visible) and `starfield={starOverrides}`. `CelestialCanvas` re-skins on a starfield change
(uniform-only, no rebuild — [[Architecture-Decisions]]), so the field reacts **live** while dragging.
Placed once in the shared `DesignEditorBody`, so it shows in **both** the admin demo tab (`AdminDemoTab`)
and the groom design editor. **Verified in a real browser** via a throwaway dev-only public harness route
(`/__devstar`, since the editor is auth-gated + MCP was down): the field renders and honours colour/size/
opacity — `{}`→warm baseline, `{size:2.5,opacity:2,#ffe9b0}`→big bright blobs, `{size:0.4,#66e0ff}`→small
cyan; live sliders take it from empty (opacity 0) to big bright cyan with no remount. Harness route +
`_DevStarPreview.jsx` removed after; only `DigitalDesignEditor.jsx` shipped. This closes the earlier
"editor UI not browser-verified" gap for the star controls.

## Envelope no-flash + visible scrolling starfield (2026-07-09)
Two owner reports on the public digital invitation.

**Bug — the sealed مكتوب flashed a different design for ~1s.** On the demo, first paint used the
built-in fallback design, then `getDemoDesignPublic()` swapped in the admin's design a beat later →
`CelestialCanvas`'s envKey-keyed `rebuildEnvelope` re-baked the sealed envelope (seal colour pale→brown,
pattern + star density changed — verified via Playwright at 150ms vs 1200ms). Fix (`DigitalInvitationPage.jsx`):
the demo now starts with `doc = null` and holds a brief loader until `getDemoDesignPublic()` resolves
(admin design, else the built-in fallback), so the envelope builds **once** with the final design — no
swap, no re-bake. Real invites already seed `doc` from the embedded `__DAWA_INVITE__` snapshot, so they
never flashed; the real-invite effect now also resolves `doc` to `{}` as a last resort so the new loader
gate can never hang. **Verified**: envelope identical at 1.6s vs 3.2s (only ambient star drift differs).

**Feature — make the 3D starfield clearly visible behind the content while scrolling, "entering
artistically", tunable via the star controls.** The field already rendered + persisted (fixed canvas,
z 0, behind content), but on LIGHT themes it was near-invisible and the scroll motion was gentle. Owner
picked: brighter on ALL themes + stronger artistic scroll motion. Changes:
- **`particles.glsl.js` (FRAG):** light-theme mote alpha `halo*0.28` (faint halo-only) → `core*0.42 + halo*0.5`
  — defined, clearly-visible motes on pale backgrounds. Still normal-blended, still scaled live by the
  groom's `uStarOpacity` control (can be dialled back).
- **`particles.glsl.js` (VERT):** central-corridor legibility floor `mix(0.06,…)` → `mix(0.18,…)` so the
  starfield genuinely reads BEHIND the centered content, not only at the margins.
- **`celestialEngine.js`:** scroll camera travel `60 - scroll*72` → `*108` so the field streams past more
  as the guest scrolls (the slab is 170 deep, so it never runs out of stars).
All three ride the shared engine/shader, so they apply to every public invitation AND the editor previews
(groom + admin demo + the new `StarfieldPreview`). **Verified** (headless Playwright, dev server, light
ivory demo): stars distinctly visible across the scroll incl. behind content; hero/card text stays legible.
Deploy: `hosting,functions:digitalInvitePreview`. See [[Visual-Design-System]], [[Architecture-Decisions]].

## Envelope tap-cue centering fix + 5s auto-open (2026-07-04)
- **Cue off-center bug:** the sealed overlay's "اضغط لفتح الدعوة" hint reused the `dawa-inv-cue`
  keyframe (`InviteStyles.jsx`), whose frames bake in `translate(-50%, …)` — correct for the
  `left:50%`-anchored `.dawa-inv-cue` class, but on the overlay's full-width block it dragged the
  line half a viewport left (clipped at the screen edge). Fix: new `dawa-inv-cue-c` keyframe (same
  opacity/bob pulse, `translateY` only) used by `CelestialEnvelopeOverlay.jsx`; plus `textIndent: 3`
  to balance the `letterSpacing: 3` trailing-space overhang under `textAlign: center`. **Rule:** any
  keyframe that bakes a `-50%` translate must only be applied to `left:50%`-anchored elements.
- **Auto-open:** if the guest doesn't tap, the envelope opens itself after
  `TIMING.ENVELOPE_AUTO_OPEN_MS` (5000, `shared/src/config/index.js` — owner picked 5s). A
  `useEffect` in `CelestialAmbience.jsx` arms a timeout only when `phase === "sealed"` **and**
  `worldReady` (new state flipped by the canvas `onReady`, so the countdown starts when the sealed
  envelope is actually visible, not while the lazy three.js chunk downloads). Cleanup clears it on
  tap; `onOpen`'s existing `phase !== "sealed"` guard makes any late firing a no-op. Covers both
  render paths (custom-background + normal 3D world).
- Verified via Playwright on `/d/demo/demo?demo=1`: cue centered, auto-open at ~5s, manual tap
  unaffected, zero console errors. See [[Visual-Design-System]].

## Content entrance cascade gated on envelope open (2026-07-04, same session as auto-open)
- **Problem:** the hero's staggered entrance (dawa-inv-rise cascade, per-element delays in
  `InviteStyles.jsx`) fired on MOUNT — behind the opaque envelope canvas — so when the envelope
  opened, the guest saw a static hero "pop" with the animation long finished.
- **Signal:** new optional `onOpened` prop on `CelestialAmbience` (fire-once effect): fires at
  `phase === "done"` or as soon as the envelope is not actually `covering` the content
  (`envActive && (customBg || wantWorld)` — the wantWorld term catches a mid-intro FPS downgrade
  tearing the normal-mode world down with phase stuck "sealed"). `DigitalInvitationView` holds
  `inviteRevealed`, stamps `.is-opened` on the `.dawa-inv` root, with a 15s failsafe timeout so
  content can never stay hidden.
- **CSS gate:** `.dawa-inv:not(.is-opened) <hero entrance selectors> { animation-play-state:
  paused; }` — fill-mode `both` holds each element at its from-frame (opacity 0) until the class
  lands; the whole delay-staggered cascade then plays from t=0. The prefers-reduced-motion blanket
  (`animation: none !important`) overrides the gate, so reduced-motion guests (who also get no
  envelope) see content instantly. Non-hero `dawa-inv-rise` users (RSVP success, guestbook, nav
  menu) are NOT gated.
- **Cross-blend fix (found by adversarial review):** in normal mode the elevated `CelestialCanvas`
  wrapper kept an OPAQUE `background: theme.bg` until phase "gone" (650ms after "done") with no
  fade — the cascade's first 650ms burned invisibly (eyebrow ~72% consumed). New `fading` prop
  (`phase === "done"`) melts that backdrop to transparent over .6s while still elevated, so the
  hero rises in beneath the star field — true cross-blend, matching the custom-bg branch's
  existing fading wrapper.
- **Gotcha (cost a build break):** `InviteStyles.jsx` is a JS template literal — CSS comments in
  it must never contain backticks.
- Verified via Playwright: sealed = paused/opacity 0; entrance staggers visibly through the
  melting cover at +300/+800ms (auto-open AND manual tap); reduced-motion = instant content;
  1062 unit tests pass. See [[Visual-Design-System]].

## Direct-to-Storage photographer uploads — resumable, 2GB, no function limits (2026-07-05)
The earlier queue/retry/rate-cap fix wasn't enough: EVERY file still went through the `api` Cloud
Function, which buffers the whole request body in its 512 MiB memory (Functions v2 exposes it as
`req.rawBody`), plus a 2-min client upload timeout — so large videos OOM'd / timed out and big batches
stalled. **Fix (owner picked direct-to-cloud, 2GB cap):** the browser now uploads STRAIGHT to GCS.
- **Flow:** (1) `POST /digital/:uid/photographer/create-upload {name,contentType,size}` → the server
  mints a GCS **resumable upload session** (`bucket.file(path).createResumableUpload`, which uses the
  SDK's OAuth to initiate — NOT signing — so it needs no "Service Account Token Creator" role, unlike
  `getSignedUrl`; that is exactly why the old `uploadAndGetUrl` avoided signed URLs). Returns
  `{uploadUrl, storagePath}`. (2) The browser PUTs the whole file to the session URI (single-shot,
  `Content-Range: bytes 0-{n}/{n}`), XHR for progress, **no timeout** → multi-GB videos + hours-long
  uploads never abort. (3) `POST /digital/:uid/photographer/register {storagePath,name}` verifies the
  object landed under the caller's own folder + is safe media, then writes the metadata doc (whose
  onCreate triggers face indexing). `storage.ts` gains `createUploadSession` + `getUploadedObjectInfo`.
- **Cap:** `MAX_BYTES.PHOTOGRAPHER` 200MB→**2GB**; a separate `PHOTOGRAPHER_LEGACY` (200MB) caps the
  fallback route (the function can't buffer more). Rate: `PHOTOG_UPLOAD_PER_USER` gates create-upload,
  new `PHOTOG_REGISTER_PER_USER` (4000/h) gates register.
- **Fallback:** the frontend tries direct; on any non-abort failure for a file ≤200MB it falls back to
  the legacy through-function multipart route (insurance for a CORS/rollout hiccup); bigger files
  re-throw so the bounded-concurrency queue + per-file retry (prior fix) retry the direct path instead
  of wasting a 413.
- **CORS (one-time, out-of-band — NOT committed):** the bucket CORS config was set via the admin SDK
  (`bucket.setCorsConfiguration`) to allow PUT from the app origins (`*.web.app`, `invite.dawa.to`,
  `dawa.to`, localhost) — required for the browser→GCS PUT. Re-run if origins change.
- **Verified:** `createResumableUpload` succeeds without Token-Creator; a **real browser cross-origin
  PUT** from `dawa-aa793.web.app` to a session URI (with `Content-Range`) returned 200 and the object
  landed; `/create-upload` is live (401 without auth); 512 backend + 550 frontend unit tests pass. The
  authenticated groom UI flow itself is auth-gated (emulator needs Java 11+) so not browser-tested end
  to end; the fallback + the verified mechanism de-risk it. Deploy:
  `hosting,functions:api,functions:digitalInvitePreview`. See [[Face Matching]], [[Architecture-Decisions]].

## Company rename → "دعوة فرحنا" + readable envelope cue (2026-07-09)
Owner rebranded the company from "دعوة" to **"دعوة فرحنا"** (name-collision with other "دعوة"
businesses). AR suffix = **فرحنا**; HE = the translation **שמחתנו** (owner picked translation over a
transliteration). Applied SELECTIVELY (owner's list), NOT a global rename — most "دعوة" strings stay:
- **Landing hero** (`LandingPage.jsx`): "فرحنا" under the gold "دعوة" headline, smaller + cream `#f5e6b8`.
- **Landing top-nav**: brand now `دعوة فرحنا` / `דעוה שמחתנו` (was hardcoded "دعوة"; made lang-aware).
- **Landing footer wordmark**: "فرحنا" stacked under "دعوة" (muted cream) — added for consistency.
- **Landing copyright**: `© {year} دعوة فرحنا · {footer_tagline}`.
- **Invitation footer** (`InviteFooterDock.jsx`): "فرحنا" under the "دعوة" mark, smaller + `theme.accent`.
- **Invitation credit** (`DigitalInvitationView.jsx`): `صُنعت بواسطة دعوة فرحنا — اصنع دعوتك ←` (+HE).
- **Manual-invite guest forms** (i18n `conf_form_welcome_title` + `conf_form_welcome_body`, AR+HE):
  "شركة دعوة" → "شركة دعوة فرحنا" / "חברת דעוה" → "חברת דעוה שמחתנו". Both guest-detail forms use these —
  the per-guest invite link (`/invite/:token`, body only) and the public confirm form
  (`/confirm/:groomUsername`, title + body). `invite_title` ("تأكيد بيانات الدعوة") left alone — there
  "الدعوة" means *the invitation*, not the company. Verified live on `/confirm/groom` (a generic test
  groom; the 3 prod grooms are `sally`/`groom`/`rani`).
Left as-is (not in the owner's list): the baked `BRAND_FULL_SVG` hero emblem, the WhatsApp booking text,
the "دعوة زفاف" sample-card label.

**Envelope tap-cue readability** (`CelestialEnvelopeOverlay.jsx`): the sealed مكتوب's "اضغط لفتح الدعوة"
cue sits ABOVE the guest name; it was a fixed 13px faint accent-gold with `letter-spacing:3` +
`uppercase` + `italic` — tiny on desktop and letter-spacing BREAKS connected Arabic. Now: `theme.text`
(guaranteed contrast), responsive `clamp(16px,3.6vw,26px)` (a bit smaller than the name's
`clamp(24,5vw,40)`, readable on phone AND computer), no letter-spacing/uppercase/italic. Pulse keyframe
`dawa-inv-cue-c` trough raised `.55 → .7` so it never dims below readable. **Verified** (headless
Playwright, dev): landing hero/nav/footer/copyright, invitation footer wordmark+suffix (`فرحنا` in
`rgb(196,164,88)`) + credit text, and the cue readable above the name on both phone (16px) and desktop
(26px). Deploy: `hosting,functions:digitalInvitePreview`. See [[Visual-Design-System]].

## Star entrance: mobile fix + speed control + demo, & صورك copy (2026-07-09)
Three owner items on the scroll-driven background starfield.

**Bug — the scroll "entrance" streamed on desktop but not on phone.** The fly-in moves the 3D camera from
the page scroll position, but `useScrollDriver` updated the scroll ref on `scroll` EVENTS, which mobile
browsers throttle/suppress during a momentum flick — so the camera sat frozen mid-scroll on phones. Fix:
`useScrollDriver` now samples `window.scrollY` every animation frame (rAF) instead of on events (the
scrollable HEIGHT is still measured only on scroll/resize/orientation, the layout-affecting reads). Same
computed value, sampled continuously → streams on mobile exactly like desktop. Affects every invitation's
scroll motion; desktop unchanged.

**Feature — per-design star ENTRANCE SPEED + live demo (groom + admin).** New `starfield.speed` multiplier
(1 = baseline): backend `sanitizeStarfield` clamps it (`STARFIELD_SPEED_MIN/MAX` 0.2–3, `constants.ts`);
`themeToUniforms` passes `starSpeed`; the engine holds it in a live JS var `camScrollSpeed` (mutated by
`setTheme`, so dragging the slider re-scales the fly-in instantly) and uses it in the scroll camera:
`tz = max(-60, 60 - scroll*108*camScrollSpeed)`. The **floor (-60)** stops a fast speed overshooting the
170-deep slab (z 40→-130) and emptying the field; at speed 1 the floor is never hit, so the baseline is
byte-unchanged. Editor: a "سرعة دخول النجوم" `RangeRow` (0.4–2, default 1, `design-star-speed`) in the
star `<Section>` (shared `DesignEditorBody` → groom + admin). Live example: `CelestialCanvas` gained a
`demoScroll` prop; the `StarfieldPreview` sets it, and the engine auto-ramps a 0→1→0 triangle sweep
(`demoT`) so the groom SEES the entrance at the chosen speed (the preview has no page scroll of its own).
**Verified** (dev harness): three demoScroll panels at speed 0.5/1/2 sit at visibly different camera depths
and animate; mobile viewport renders the field.

**Copy — صورك empty state:** `DigitalYourPhotos.jsx` "الصور لم تُنشر بعد من قِبل العريس" → "…من قِبل
صاحب/ة الفرح" (gender-inclusive); HE "על-ידי החתן" → "על-ידי בעלי השמחה".

Deploy: `hosting,functions:api,functions:digitalInvitePreview` (api because the persisted `speed` field is
new). See [[Visual-Design-System]], [[Architecture-Decisions]].

## DECIDED, not built: reel-derived templates + the reel→template prompt (2026-07-14)
Grilled (8 questions). Owner wants invitation designs seen in **Instagram reels** fully implemented as
**templates** for the digital invitation. Immediate deliverable shipped: a reusable prompt for **Claude
Design** (the tool the 3D envelope originally came from) — `docs/REEL-TO-TEMPLATE-PROMPT.md`. Decisions:
- **Audience/input:** the prompt is pasted into Claude Design per reel; the reel arrives via a
  **connector**, with an ordered-screenshots fallback baked into the prompt (Claude models read stills,
  not video — the prompt instructs the model to STOP if it can't actually retrieve frames).
- **Output per reel:** a single **self-contained HTML mockup** (CONTENT + TOKENS config objects, Google
  Fonts only, code-drawn ornament) **+ a companion spec** (shot list, tokens, typography, motion
  inventory, section map, port notes) — same import pipeline that worked for the envelope.
- **Structure:** the **reel's structure leads**, but ALL functional blocks are woven in (owner selected
  all four groups): hero essentials, RSVP (headcount + required phone), countdown + venue/map,
  guestbook + gift + dock; story/gallery/details where the flow allows.
- **Envelope:** the reel's intro **replaces** the 3D envelope in reel templates (`envelopeEnabled:
  false`) — but the **sealed guest-name + tap-to-open ritual is preserved**, restyled per reel
  (personalization + browser-gesture gating).
- **Fidelity:** owner chose **pixel-perfect clone** (risk of copying published designers' work into a
  commercial product was flagged and accepted). Physical limits: artwork is redrawn in code; couple
  photos → placeholder slots; audio never included (mood described in spec).
- **Palette:** delivered **as `digitalThemes`-shaped tokens** (template's native theme), so the existing
  theme machinery (background, starfield, nav, contrast pairs) keeps working.
- **Constraints hard-coded in the prompt:** RTL, bilingual AR/HE with toggle, mobile-first 390×844, no
  Arabic letter-spacing, Western digits, Arabic/Hebrew-capable Google Fonts only, reduced-motion floor.
The **port into the app** (template registry, editor picker, how a template snapshot mints) is a separate
project needing its own design + go-ahead — see TASK-TPL-1 in [[Tasks Backlog]]. See
[[Visual-Design-System]], [[Architecture-Decisions]].

## Envelope opening-STYLE picker (scaffold) (2026-07-09)
Owner wants to offer multiple "شكل فتح المكتوب" (envelope-open) styles later; asked for the PICKER box
now with the single existing style. Built the full scaffold so future styles slot in cleanly:
- **Data:** new `envelope.style` slug (default → "classic"). `sanitizeEnvelope` validates it as a safe
  slug `^[a-z0-9_-]{1,32}$` (NOT a fixed enum) so new style keys can ship from the client with no backend
  redeploy; unknown/empty → unset → classic. Rides the existing `envelope` object (already a DESIGN_FIELD).
- **Editor:** a card-grid picker (`ENVELOPE_STYLES`, mirrors the theme/font pickers) at the TOP of the
  "المظروف ثلاثي الأبعاد" `<Section>` in the shared `DesignEditorBody` → shows at groom + admin. One card
  today ("المكتوب العادي" / "המעטפה הרגילה", `design-env-style-classic`, ✉️) + a dashed "أشكال أخرى قريباً"
  placeholder. Wired via `setEnvField("style", key)`; active = `envOverrides.style || "classic"`.
- **Render:** the engine still draws the one classic envelope — `style` is not yet branched on; adding a
  style = a new `ENVELOPE_STYLES` entry + its look in the 3D engine keyed on `envelope.style`.
- **Verified** (dev harness, AR+HE): selected classic card + coming-soon placeholder render correctly.
Deploy: `hosting,functions:api,functions:digitalInvitePreview` (api for the persisted `style`).
Related owner Q: a raw opening VIDEO can't be ingested; still frames/screenshots or a description can be
rebuilt into the 3D envelope. See [[Visual-Design-System]], [[Architecture-Decisions]].

## DECIDED + BUILDING: 4 webgency-inspired bespoke templates (2026-07-15)
Owner: "go to webgencyinvitations.com, recreate the designs as new templates with cooler visual effects,
fully customizable like the current digital invite with token; take opening animation + visual effects,
not their texts/photos." Grilled (7 questions) + `/design-research` test-plan + `/synthesize`. This is the
real execution of **TASK-TPL-1** — the first bespoke templates through the registry seam built in a667fbc.

**Locked decisions:**
- **Scope:** the **top 4 flagships** only — `destination-love` (Most Popular), `dolce-vita` (Popular),
  `sacred-garden` + `blossom-oud` (both NEW). Skipped: Vibrant Vows, Royal Gold, Minimalist, and
  "Eternal Romance" (`jathuandthanu` — a **real couple's** personalized page, not a generic template).
- **Fidelity:** **inspired-by reinterpretation** — source mood/palette/motion as reference, freely
  redesigned; NO texts/photos copied (only opening animation + effects, per the ask).
- **Architecture:** **fully bespoke component tree per template** — shares only the design-doc data
  contract, the `DigitalInvitationView` prop contract, and `useRsvpForm`/`useCountdown`/`confettiBurst`
  (+ `WalletButton`). **Hard rule: no new design-doc fields** (keeps mint/sanitize/PUBLIC_DESIGN_FIELDS/SSR
  untouched — a template renders only from the existing schema).
- **Theming:** each ships a native `digitalThemes`-shaped palette + 2–3 curated recolor variants; the
  editor theme picker is **filtered per template** (new `themes` metadata field); fonts stay free with a
  native default.
- **Effects:** **maximum wow, WebGL allowed** — per-template three.js scenes, lazy-loaded, with a 2D CSS
  fallback + `prefers-reduced-motion` static floor + device-capability tiering (`useDeviceCapability`,
  `downgradeStore` FPS latch). But **WebGL never blocks the ritual** (sealed layer is pure CSS/DOM; scene
  prefetches during sealed idle; tap always plays an immediate CSS opening animation).
- **Opening:** each template's own **sealed-tap intro replaces the 3D envelope** (`envelopeEnabled:false`
  default); sealed = static guest name + tap cue, nothing animates until tap. Governed by the shared
  `useIntroPhase` contract (below). Editor hides the 3D envelope / starfield / custom-bg controls for
  bespoke templates.
- **Names:** original bilingual AR/HE per template, chosen at build (kebab ids are permanent once minted).
- **Dirty tree:** the uncommitted **gilded-orchard scaffold** was **stashed** (`git stash`, recoverable —
  events revival + bg decorations + `gildedOrchard` palette) to restore the clean classic-only baseline.

**Synthesis (affinity + JTBD) → intro-contract safeguards.** The no-auto-open decision collides with the
[[UX Research Discovery 2026-07-02]] **P2 "Im Khaled" floor** (older WhatsApp-only guest may not know to
tap) and the audit "loading wall". So `useIntroPhase` bakes in: an **escalating cue** (~8s idle → stronger
hint), a **skip** control, a **return-visit fast path** (per-token localStorage → instant reveal + replay),
and a **stuck-screen failsafe** (20s hard-cut to content, distinct from auto-open). The no-auto-open call is
**reversible pending a Wave 1 usability gate** after template 1 ships (contingency: stronger cue → timed
auto-open like classic). Editor also gets **legible curation** (copy above the curated chips; switch-confirm
states content is kept / look resets) for the P1 "invisible changes / irreversibility" anxiety. Full plan in
`~/.claude/plans/go-to-this-website-snuggly-curry.md`; usability plan in [[Usability Templates Test Plan]].

**Phase 0 BUILT (2026-07-15, plumbing — one commit, classic path unchanged):**
- `shared/src/data/digitalTemplates.js` — optional `bespoke:true` + curated `themes:[key,…]` metadata
  fields + `getTemplateThemeKeys(id)` export (returns `null` for classic → full list).
- `frontend/.../templates/TemplateRenderer.jsx` — `<Suspense>` boundary + `TemplateLoadCover` (public =
  full-viewport theme-bg + guest name so the wait reads as the sealed state, not a loading wall; preview =
  themed pulse). `registry.js` documents the module-scope `lazy()` registration pattern (classic stays eager
  as the fallback).
- `frontend/.../templates/introContract.js` — **`useIntroPhase({active,token,openMs})`** phase machine
  (sealed→opening→done) with cue escalation, skip, replay, reduced-motion, failsafe, and the seen-token fast
  path. This is the uniform sealed-tap contract every bespoke template's `<Intro>` runs on.
- `DigitalDesignEditor.jsx` — `isBespokeTpl`; theme picker iterates curated keys (`themeKeysForPicker`,
  appends active-but-uncurated defensively); hides envelope + immersive3d toggles and the 3D-envelope /
  starfield / custom-bg `<Section>`s for bespoke; curation copy above the chips.
- Tests: extended `registry.test.js` (bespoke invariants — curated∈themes, themes[0]===default themeColor,
  envelopeEnabled false); new **`backend/tests/functions/digitalTemplateSync.test.ts`** (mechanizes the
  backend↔shared `TEMPLATE_IDS`/`THEME_COLORS` mirror — a real gap before); new `useIntroPhase.test.js`.
  Full unit suite green (frontend 566, backend 522).

**Template 1 SHIPPED (2026-07-15): `destination-love` (رحلة الحب / מסע האהבה).** A travel /
boarding-pass theme — the first bespoke template through the seam. `frontend/src/components/
digital/templates/destination-love/`: `DestinationLoveView` (data contract identical to
DigitalInvitationView) + `Intro` (sealed boarding pass → tap → plane fly-in + INVITED stamp →
reveal, on `useIntroPhase`) + bespoke `sections.jsx` (medallion hero w/ flight arc, boarding-pass
details card, departure countdown, flight-route timeline, destination/venue, ticket RSVP via the
shared `useRsvpForm`+confetti, gift, guestbook, footer) + `effects/` (three.js parallax sky —
drifting clouds/motes + tilt/pointer parallax — lazy, with a 2D CSS floor fallback, device tiering,
FPS-guard downgrade, reduced-motion floor; **imperative canvas per mount** fixes the StrictMode
context-loss remount bug) + scoped `Styles.jsx` (CSS vars, no template-literal interpolation) +
`tokens.js` (per-palette motif colours + `isLight`). 3 native palettes **voyage / voyageAzure /
voyageSand** (curated list; native font Aref Ruqaa). Backend `TEMPLATE_IDS` + `THEME_COLORS`
extended; registry + hero thumbnail wired.
- **Verified E2E in the emulator** (create→PATCH `templateId`→submit→approve→mint→open): sealed
  boarding pass w/ real guest name from `designSnapshot` → tap → open → all 9 sections; RSVP
  attending→prefilled phone→submit→success+confetti; AR↔HE RTL; voyage (dark) + voyageSand (light)
  palettes; **live WebGL scene on the public page** (canvas + GL context, 0 console errors after
  the remount fix); editor shows the **curated 3-chip theme picker + curation copy**, native font
  active, and **all classic 3D controls hidden** (envelope/starfield/custom-bg + toggles), footer
  toggle kept; picker hero thumbnail loads. Frontend 568 + backend 522 unit green; `npm run build`
  splits the template + a 3.7 kB Scene3D chunk off the shared `three` vendor chunk.
- **Post-ship feedback round 1 (2026-07-15, owner review): brand-palette alignment — SHIPPED.**
  Owner accepted the functionality but required the template palettes to match **the website's own
  identity and luxury feeling**, not the source site's pastels. Fixed values-only (no ids/keys/backend):
  `voyage` re-grounded on brand gold `#c9a84c` on near-black `#07070a` (theme.js C tokens); `voyageAzure`
  aligned to the in-brand `blue` family (`#070a14`/`#8fb8e0`) with a gold-trimmed medallion; `voyageSand`
  aligned to the in-brand `ivorygold` luxe family (`#faf5e7`/`#c4a458`). Motifs: plane/solid accents →
  gold family, stamp → wax-seal red `#b3232a`, boarding-pass panel → classic-envelope cream `#f9f6f0`;
  `DlButton` → the classic gold-gradient treatment; new `onSecondary` ink token replaced the isLight
  ternaries; fixed a silent bug where sections read undefined `t.accent` (now a real convenience mirror).
  Verified all 3 palettes in-browser at 390×844 + regenerated the picker thumbnail. Tests 568+522 green.
  **⭐ STANDING RULE for all future bespoke templates (incl. templates 2–4):** palettes derive from the
  brand family — near-black `#07070a` / ivory-gold grounds, `#c9a84c`-family accents, cream paper panels,
  wax-red accent stamps; the source design contributes layout/motion/ornament language, **never its color
  identity**.
- **NEXT — Wave 1 usability gate (owner-run):** per [[Usability Templates Test Plan]], run the
  formative wave (4–5 participants, incl. an older P2 guest on a budget Android) on `destination-love`
  BEFORE building templates 2–4 (`dolce-vita`, `sacred-garden`, `blossom-oud`). It resolves the
  no-auto-open sealed-screen decision + the default effects tier; findings feed back into
  `useIntroPhase` so the remaining 3 inherit the tuned contract.
See [[Visual-Design-System]], [[Architecture-Decisions]], [[Tasks Backlog]], [[Usability Templates Test Plan]].

## Template demo surfaces + guest-experience metrics (2026-07-16)
Two features shipped together, both driven by owner Q&A (3 rounds, no assumptions):

**Seeing a template** — the bespoke system could render templates but had no way to
show them. Now: a public `/templates` gallery + a landing strip, **per-template
demo links** (`?demo=1&template=<id>` — one shared admin-published demo content
rendered by any template), a "معاينة حيّة" preview button on the groom's picker, and
**admin-uploadable preview covers** (pointer doc `appConfig/templateAssets`,
deliberately NOT a design field, so the bespoke no-new-fields rule holds). Full
design + `?template=` semantics: [[Template Demo Surfaces]].

**Measuring the guest** — load time (sealed-visible + fully-ready + web-vitals),
time-to-open (send→first-visit lag AND on-page tap delay, with `tapKind`
separating a real tap from classic's 5s auto-open), and RSVP completion (any
answer) with opened-but-never-answered / never-opened buckets. Instrumented at the
**shared `useIntroPhase` contract** (new optional `onEvent`), so every bespoke
template reports identically and none can forget to; classic hooks
`CelestialAmbience`. Never blocks the ritual. Full design: [[Guest Experience Metrics]].

**Contract note for future templates:** a bespoke template gets the sealed/open
signals for free from `useIntroPhase`; it only needs to thread an `onReady` from its
effects layer (see `destination-love/effects/SceneHost.jsx`) so "fully loaded" is
reported. Two ordering traps are already handled centrally — `ready` can arrive
before `sealed`, and child effects run before the page wires the recorder.

See [[Template Demo Surfaces]], [[Guest Experience Metrics]], [[Admin Analytics]].

## DECIDED: full template catalogue (9) + multi-day events (2026-07-16)
Grilled (6 questions). Owner: *"all the templates should be included as a templates for the user to
check, all of them, and the old one should also be included."* Scope widened **4 → 9**; the top-4-only
decision of 2026-07-15 is superseded. See [[Tasks Backlog]] TASK-TPL-2 and the plan
`~/.claude/plans/search-and-think-and-delegated-allen.md`.

| # | Decision |
|---|---|
| 1 | **9 selectable**: `classic` (the old one) + `destination-love` (both LIVE) + 7 to build — `dolce-vita`, `sacred-garden`, `blossom-oud`, `template2`, `template3`, `template5`, `gilded-orchard`. **"Eternal Romance" (`jathuandthanu`) stays excluded** — a real couple's personalized page. |
| 2 | **Wave 1 gate → non-blocking.** Build now, gate later: the sealed-tap contract is ONE shared file (`useIntroPhase`), so a finding changes it once and all 9 inherit. |
| 3 | **Multi-day `events` on ALL templates** — editor exposure + a schedule render in every template, not template-locked. |
| 4 | **Palette: brand GROUNDS constant** (near-black `#07070a` / ivory-gold + gold trim), **one in-brand accent per template**. Refines the 2026-07-15 standing rule *for a 9-template catalogue*: strict gold everywhere would make the gallery read as one design nine times; distinctness now comes from layout/motion/ornament **plus** an accent. Consistent with the shipped `voyageAzure` (in-brand blue). |
| 5 | **Review every template before the next** (7 cycles). |
| 6 | **Events-everywhere lands first**, as its own reviewable phase. |

**`events` is a REVIVAL, not a new field — the no-new-design-doc-fields rule holds.** It is already in
`DESIGN_FIELDS` (`constants.ts:169`), has a full `EventItem` sanitize branch (`sanitize.ts:153,374`),
an `eventsEnabled` toggle (`:203`, defaulting **true** in `workflow.routes.ts:60`), and rides
`PUBLIC_DESIGN_FIELDS` → `designSnapshot`. **Nothing in the frontend has ever read it** (verified: every
`events` hit is `pointer-events` CSS). It predates the luxury-editorial redesign and simply lost its UI.
So mint / sanitize / SSR stay untouched. Shape:
`EventItem = { icon, title, time, venue, address, mapUrl }` (title/time/venue/address localized).
Render gate is the standard `on(design?.eventsEnabled) && events.length > 0`, so empty arrays auto-hide
and **every existing design and already-minted token is visually unchanged**.

**Stash hazard (RESOLVED — stash dropped 2026-07-17):** the 2026-07-15 `gilded-orchard` stash was
mined by hand and dropped. Taken: the `events` revival (→ Phase 0) and the `gildedOrchard` palette
(→ that template). **Deliberately REJECTED: its `themeToBackground.js` + `sanitize.ts` hunks**, which
modelled the decorations (`stringLights`, `stringLightsColor`, `vineBorders`, `fountain`,
`fountainColor`) as **new design-doc background fields** — that would have breached the hard
no-new-design-doc-fields rule for ornament only one template ever uses. `gilded-orchard` instead draws
its lights/vines/fountain **intrinsically**, in its own components, so the schema did not grow. The
stash was dropped rather than kept because a stale "recoverable, parked" stash is a *trap*: popping it
later silently re-adds the rejected fields.

### Phase 0 SHIPPED (2026-07-16) — multi-day schedule on every template
- **Shared schema**: `events` → `ARRAY_KEYS`, `eventsEnabled` → `TOGGLE_KEYS`.
- **Editor**: a "جدول الاحتفال (عدة أيام)" `<Section>` (step `venue`, testid
  `design-events`, toggle `design-toggle-events`) — icon/title/time/venue/address/mapUrl
  per row, max 6, on every template.
- **Render**: `sections/InviteEvents.jsx` (classic — a timeline with a rail + connector,
  styles in `InviteStyles.jsx`, `#inv-events`, nav entry `الجدول` w/ the calendar icon) and
  `destination-love`'s `ItinerarySection` (`#dl-itinerary` — the same data as numbered
  boarding-pass legs). Map link prefers the couple's `mapUrl`, else a venue+address maps search.
- **Additive by construction**: gate is `on(eventsEnabled) && items.length > 0`, so existing
  designs + already-minted snapshots are untouched. Verified live on both templates.
- **Bug caught in the parked scaffold before adopting it**: it listed `icon`/`mapUrl` in the
  shared `ARRAY_ROW_FIELDS`, but the NATIVE editor writes every key listed there as a localized
  `{ar,he}` object while the server clamps those two via `clampField` (plain). Only the four
  localized cells are listed now (matching `storyTimeline`, whose plain `icon` is omitted for the
  same reason); `backend/tests/functions/digitalEventsSanitize.test.ts` pins the contract — that
  branch had zero coverage despite years in the schema.
- **Templates 1–7 each render `events` natively** from here on — never retrofitted.

### CORRECTION: the catalogue is **8**, not 9 (2026-07-16)
**`template2` IS `gilded-orchard`.** At scout, webgency's `template2` turned out to be string lights +
a fountain + vines on navy — i.e. exactly the design the 2026-07-15 stash had already scaffolded under
the name `gilded-orchard`. They were counted as two separate templates in the decision table above, so
"9 selectable" double-counted one design. **Final catalogue: 8** — `classic`, `destination-love`,
`dolce-vita`, `sacred-garden`, `blossom-oud`, `gilded-orchard` (= template2), `lumen` (= template3,
"Light design"), `royal-gold` (= template5, "Viktor and Paula"). Decision-table row 1 above and the
old "7 to build" count are superseded by this line; every other decision (2–6) stands.

### ALL 8 SHIPPED (2026-07-16 → 07-17) — TASK-TPL-2 complete
Built one per phase against the recipe in [[Template Demo Surfaces]]. Every one is an **inspired-by
reinterpretation** — no source text or photos — with code-drawn SVG ornament (so no template ships a
raster asset beyond its 390×520 gallery cover), 3 curated palettes on brand grounds + one accent, and
RSVP / countdown / sealed-tap routed through the shared hooks.

| Template | Source | Identity | Accent · font |
|---|---|---|---|
| `dolce-vita` | Dolce Vita | Riviera stationery, wax-sealed letter, **scratch-to-reveal** date | blue · messiri |
| `sacred-garden` | Sacred Garden | Embossed floral envelope, monogram seal, torn edges, CSS petals | green · reem |
| `blossom-oud` | Blossom & Oud | **Mihrab arch**, girih, arabesque band | rose · scheherazade |
| `gilded-orchard` | template2 | String lights, fountain, vines (palette lifted from the stash) | gold · markazi |
| `lumen` | template3 | Effect-free minimalist — wide serif capitals, WHEN?/WHERE? | greige · noto |
| `royal-gold` | template5 | **The wall** — cream bands torn out of wine, photos hung in gold frames | wine/gold · amiri |

**`royal-gold` is the only template besides `classic` that renders `media`** — as hung, tilted gold
frames rather than a grid. Its wall/band stripe is assigned by **rendered** index (`assignStripe`,
exported + tested over all 2^8 on/off subsets): gallery and schedule are pinned to the wall because
the frames and the rose only read against wine, a pinned wall resets the alternation, and the rest
flip — which is what stops two torn cream bands ending up adjacent when a groom switches off the dress
code or gift section. Its ivory palette **inverts** the wall and band roles, so every consumer reads
`ink(t, onBand)` and nothing hard-codes a colour.

**a11y trap worth remembering (royal-gold ivory, and the same one [[Visual Design System]] hit on the
classic cream palette):** a gold that clears 4.5:1 as a raw token can still fail once rendered.
- `frame` (ornament: frames, seal, diamonds) is decorative and stays bright; a separate **`frameInk`**
  carries text. On the dark grounds they're the same colour; only ivory's cream wall forces them apart.
- The **opacity blend is what sets the value**: the intro cue renders at `opacity:.85`, and `#7f642d`
  measured 5.1:1 raw but **3.78:1 blended**. Shipped `#685224` (6.80 raw / 4.77 blended).
- A button's label must contrast with **its own background**, not the band: `bandInk` is cream on the
  ivory palette, so gold buttons went cream-on-gold at 3.3:1. Hence **`onFrame`**.
- Guarded by 15 per-palette contrast tests covering the raw token AND the .85 blend, verified
  non-vacuous by restoring the failing colour.

**Concurrency hazard (2026-07-17):** this phase ran while a second Claude session was editing the same
working tree ([[Web Quality Report 2026-07-16]]). It deleted untracked files mid-build and reverted
tracked edits twice, and the `netlify.toml` deletion leaked into the Lumen commit (amended out). If two
sessions must share a tree: **commit early**, back work up outside the repo, and diff every file before
staging — `git add <path>` still stages the *other* session's hunks in that file. See [[Known Bugs]].

See [[Template Demo Surfaces]], [[Guest Experience Metrics]], [[Usability Templates Test Plan]],
[[Arabic Typography]], [[Visual Design System]].
