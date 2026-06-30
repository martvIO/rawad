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
