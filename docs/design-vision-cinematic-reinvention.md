# Design Brief — "دعوة (Dawa)": A Cinematic, WebGL Reinvention

> **What this is.** A design-vision prompt to hand to a design tool ("Claude design"). It defines the
> *feel, mood, and interaction* of a bold reinvention of Dawa's public web surfaces — and the
> non-negotiable constraints — while leaving the implementation tech to the design tool. It is written
> to stand alone: copy from the line below.

---

## North star
**"The envelope opens, and the night begins."**

Reinvent Dawa's public web surfaces into a cinematic, real-time **WebGL 3D** experience built around a
single soul-object: **a luxurious envelope** — sealed on the marketing site, opening to reveal each
couple's world on the invitation itself. The mood is **filmic and dramatic**: warm gold light carved out
of deep, graded cinematic black. **Universal luxury** — timeless, never cultural cliché. Every scroll
feels like a camera move, every interaction feels physical, every tap feels instant.

This is a **bold reinvention**, not a reskin. Be ambitious. Aim for work people screenshot and forward.

## Who this is for
Dawa is a wedding-invitation platform. Redesign three public surfaces as **two related chapters** that
share one DNA (the envelope, the gold-on-black film grammar, the typography, the materials) but are tuned
to different jobs:

- **Chapter 1 — Landing page (`/`)**: sells the product to couples and their families. **Confident,
  product-forward, self-assured.**
- **Chapter 2 — Digital invitation (`/d/:couple/:token`)**: the emotional microsite a guest opens from
  WhatsApp, usually **on a phone**. **Intimate, celebratory, personal** — and different for every couple.
- **The forms (`/confirm`, `/invite`, `/invite/digital`)**: where guests respond. **Full cinematic
  treatment**, but a guest must still complete them in under a minute, one-handed, on a phone.

*(Out of scope: the login screen and authenticated admin/groom/driver portals.)*

## The signature object — the Envelope
The envelope is the throughline of the whole brand and the hero WebGL centerpiece on every surface:

- **On the landing page** it is *sealed* — hovering in volumetric light, wax-sealed, catching gold
  specular highlights, slowly rotating, reactive to cursor / touch / device tilt. It is the promise.
- **On the invitation** it is *personal* — the guest's name embossed on the face; the seal cracks as the
  guest taps or scrolls; the envelope opens and the couple's world unfolds out of it.
- **On the forms** it is the *stage* — fields and choices sit on the "letter" surface inside it; an RSVP
  is a tactile, physical act (e.g. pressing a wax seal), and submitting "sends" or "seals" the letter.

Treat it as a real, physically-credible object: paper grain, gold foil, wax, weight, and light that
catches its edges. It should feel hand-makeable, not like floating CGI geometry.

## Visual system
- **Color & light.** Warm gold on **cinematic black** — black is a *graded, slightly warm darkness* with
  real light falloff, not flat `#000`. Volumetric warm light, deep shadows, gentle filmic bloom, lens-like
  depth of field. Gold reads as **foil / leaf / metal** (specular, anisotropic), not flat yellow.
- **Material.** Physically-based and tactile: paper grain, gold foil, wax, glass, silk. Light should rake
  across surfaces and catch edges. Restraint over sparkle — luxury is in the *quality* of light, not the
  quantity of effects.
- **Typography.** Oversized, editorial, cinematic display type with masked / letter-by-letter reveals for
  hero moments; a clean, quiet companion for body and UI. **Preserve and honor the Arabic + Hebrew
  pairing** — type must look intentional and beautiful in both scripts, RTL.
- **Motion language.** The **camera is a character.** Scroll = dolly / push-in / parallax through real 3D
  depth. Everything has weight and considered easing — no linear ramps, no cartoon bounce. Hero reveals
  are slow and earned; UI micro-interactions are crisp (well under ~150ms).

## Interaction model (blend everything)
- **Entry — a cinematic intro sequence.** First load opens with a brief branded moment: a title card /
  camera push toward the sealed envelope. Provide a **fast-path** (skip + instant entry) for repeat
  visitors and for reduced-motion users. It sets the tone without making anyone wait for content.
- **Scroll — film-like.** Scenes flow into one another; the envelope opens, the letter unfolds, content
  rises out of it as the camera travels. Each section is a *scene*, not a div.
- **Reactive — physical.** The 3D centerpiece responds to cursor, touch, and device tilt (parallax, light
  tracking, drag-to-rotate the envelope). It should feel like holding the object.
- **Snappy — premium UI.** Buttons, toggles, and fields respond instantly with refined feedback (a gold
  ripple, a foil shimmer, a wax press). Never sluggish, never janky.

## Page-by-page direction

### Landing page — the confident chapter
- A hero where the **sealed envelope floats in volumetric light**, reactive and slowly turning; headline
  type assembles cinematically; the primary CTA framed as an invitation to "open your envelope."
- The product story unfolds as a **scroll-driven film**: services (paper vs. digital), how it works, the
  showcase. Reimagine the current phone-mockup showcase as a **real 3D device or a floating, opened
  invitation** the camera moves around.
- Pricing / process / FAQ get filmic section transitions and depth — confident, spacious, premium.
- The whole page should feel like a *trailer* for the magic the invitation delivers.

### Digital invitation — the intimate chapter
- **Entry:** the guest's name embossed on a wax-sealed envelope; a tap / scroll **cracks the seal** and
  the envelope opens into *this couple's* world.
- **Preserve every section** the couple can enable — **story, gallery, details, venue, countdown, RSVP,
  gift, guestbook** — and reimagine each as a **cinematic scene** the camera travels through. Define the
  pacing so it feels like one continuous film, not a stack of cards.
- Rebirth the existing ambient effects (petals, sparkles, aurora) as **real volumetric 3D** — drifting
  particles, god-rays, depth. The RSVP "attending" celebration becomes a **real 3D particle burst**.
- **CRITICAL — it is a template, not a bespoke piece.** Each couple chooses from an existing system of
  **15 color palettes** and **12 Arabic/Hebrew font pairings**, and toggles sections on/off. The
  warm-gold-on-black flagship is the *default / hero* look, but **define how the cinematic language flexes
  across all palettes and fonts**, and how it stays beautiful whether a couple has 2 photos or 40, all
  sections on or only three. Personalization (couple names, date, venue, guest name) must remain
  first-class. Design a *system*, and show it across at least a few palettes.

### Forms — full cinematic, but fast
- The envelope / letter is the **stage**; fields sit on the warmly-lit letter surface. The RSVP yes/no is
  a **tactile, physical choice** (e.g. pressing a wax seal). Submitting **seals / sends** the letter.
- **But usability is sacred:** large tap targets, instantly legible, zero friction, one-handed on a phone,
  completable in **under 60 seconds**. The spectacle must never slow the answer down.

## Hard constraints (non-negotiable)
1. **RTL-first, bilingual Arabic + Hebrew** — layout, type, and motion must mirror correctly.
2. **Mobile is the primary device for the invitation.** WebGL must perform on mid / low-end phones and
   **degrade gracefully** to a beautiful static / video poster fallback when WebGL is weak or unavailable.
3. **`prefers-reduced-motion`** must have a **complete, elegant, motion-free path** — never broken.
4. **Performance:** heavy 3D **lazy-loads**; first meaningful content and the RSVP must be reachable fast;
   respect long-cache immutable assets.
5. **Accessibility:** WCAG AA contrast, visible focus, keyboard paths, semantic content under the
   spectacle; the RSVP and key info must work without the 3D.
6. **Theming is a system:** the language must flex across the existing 15 palettes / 12 font pairs /
   section toggles — not a single hard-coded art piece.

## What "great" looks like
Awwwards-tier. A guest forwards the invite *because it's beautiful*. The couple feels their wedding is
important. The envelope is the thing people remember and screenshot. Nothing reads as templated or stocky.

## Avoid
- Generic "3D = floating gray geometry + neon" tech-demo aesthetics.
- Motion for motion's sake; anything that delays the RSVP or makes guests wait.
- Breaking RTL or treating Arabic / Hebrew as an afterthought.
- A one-off art piece that can't adapt to each couple's data and theme.
- Un-skippable intros; jank or overheating on phones.

## Optional touchstones (use loosely, don't imitate)
Filmic title sequences; luxury fragrance / fine-jewelry house websites; premium hardware product-launch
microsites; the tactile romance of letterpress and gold-foil stationery. Borrow the *quality of light and
restraint*, not specific layouts.

## What to produce
For **each of the three surfaces**: a clear visual / mood direction; the envelope concept and how it
behaves; color / light / type / material / motion specs; storyboards for the key moments (intro,
envelope-open, a content scene, RSVP success); how the language **flexes across palettes / fonts**; and
the reduced-motion + mobile fallback direction. Lead with the feel; you choose the implementation tech.
