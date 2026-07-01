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

See [[Visual-Design-System]], [[Architecture-Decisions]].
