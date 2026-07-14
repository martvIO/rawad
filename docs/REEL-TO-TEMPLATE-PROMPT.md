# Reel → Template Prompt (for Claude Design)

Reusable prompt that turns a wedding-invitation design seen in an Instagram reel into a
Dawa template candidate. Decisions behind it were grilled on 2026-07-14 — see
`wiki/Digital-Invitations.md` ("DECIDED, not built: reel-derived templates").

**How to use (per reel):**
1. Open Claude Design.
2. Fill the two `{{…}}` slots at the top of the prompt.
3. Attach the reel via the connector — or, if the connector can't fetch/return it,
   attach 8–15 **ordered screenshots** of the reel (opening, each section, transitions,
   ending). The prompt handles either input.
4. Paste everything below the line and send.
5. You get back **(A)** a single self-contained HTML mockup and **(B)** a companion spec.
   Hand both to a Claude Code session in this repo to port as a template (that port is a
   separate project — TASK-TPL-1, needs its own design + go-ahead).

---

REEL SOURCE: {{connector link to the reel — or "see the attached frames, in order"}}
MY NOTES: {{optional: what you loved most, anything to change, a name idea for the template}}

You are recreating, at maximum fidelity, the wedding-invitation design shown in the
Instagram reel referenced above. The recreation becomes a **template** for دعوة (Dawa), a
digital wedding-invitation product for the Arab/Israeli market, where guests open a
personalized link on their phone (sent over WhatsApp).

## 1. Study the reel first

- If the reel is available through the connector, examine it densely across its full
  timeline — do not judge it from one or two moments. If you cannot actually retrieve
  frames from it, STOP and say so explicitly (I will supply screenshots instead); do not
  invent a design you have not seen.
- If frames/screenshots are attached, treat them as an ordered timeline of one animated
  design.
- Before building anything, output a **shot list**: second-by-second (or frame-by-frame)
  description of what appears, what moves, how it moves (direction, speed, easing feel),
  the palette, the typography, and the ornamental artwork. I will not confirm it — it is
  your working reference; include it at the top of the spec.

## 2. Fidelity mandate — this is a clone, not an homage

- Reproduce the layout, composition, motion choreography, timing, easing, color palette,
  typographic feel, and ornamental style **as closely as the medium allows**. When in
  doubt, match the reel.
- All artwork must be **redrawn in code** (inline SVG / CSS / canvas) since it cannot be
  extracted from video — but redraw it to look as close to the original as you can.
- Photographs of the couple in the reel are NOT cloned: they become clearly-marked
  **placeholder photo slots** (every real wedding supplies its own photos).
- Audio is never included. Describe the soundtrack's mood/tempo in the spec instead.

## 3. Non-negotiable product constraints (Dawa reality — never violate these)

- **Mobile-first**: design at 390×844 (the reel's 9:16 frame maps naturally). Must remain
  usable up to desktop widths with no horizontal scroll.
- **RTL + bilingual**: the page is RTL. Every text slot exists in **Arabic and Hebrew**
  (`{ ar: "...", he: "..." }`). Include a small floating AR/HE toggle that switches all
  text.
- **Arabic typography rule**: Arabic text must NEVER have positive `letter-spacing` — it
  breaks cursive letter joins. Decorative wide tracking is allowed for Hebrew/Latin only.
  Use Western (ASCII) digits everywhere, isolated with `<bdi dir="ltr">` when inline in
  RTL text.
- **Fonts**: Google Fonts only, and only families with full Arabic coverage (and Hebrew
  coverage for the Hebrew slots). Pick the closest match to the reel's lettering (e.g.
  Amiri, Aref Ruqaa, Reem Kufi, Marhey, Cairo, Tajawal for Arabic; Frank Ruhl Libre,
  David Libre, Heebo for Hebrew). Name your choice and the reasoning in the spec.
- **The opening ritual (replaces Dawa's 3D envelope in this template)**: the page loads
  **sealed and at rest** — it shows the guest's name (`{{GUEST_NAME}}`) and a tap/press
  cue, both restyled in the reel's visual language. NOTHING animates or plays until the
  guest taps. On tap, the reel's opening animation plays, then flows into the invitation.
  If the reel has its own "addressed-to-you" moment, merge the two; if not, design the
  sealed state yourself in the reel's style.
- **Every text/photo is groom-editable**: no hardcoded couple content. All content lives
  in a single `CONTENT` object at the top of the file (bilingual slots), consumed by the
  markup. Use realistic sample values (e.g. كريم & ليلى / כרים & לילה).

## 4. Mandatory functional blocks — weave ALL of these into the reel's flow

Follow the **reel's own structure and order**, but every block below must exist somewhere,
restyled to match the reel (a block the reel doesn't show still appears, designed by you
in the reel's language):

1. **Hero essentials** — personalized guest greeting, couple names, wedding date + time,
   venue name/city.
2. **Countdown** — live countdown to the exact wedding hour.
3. **Venue** — address, a directions/map affordance, room for optional nearby hotels.
4. **RSVP** — attending/absent choice; total-headcount stepper (min 1, "how many are you
   including yourself"); **required phone field** (LTR input); optional meal-preference
   chips, song request, and note. A styled success state after submit.
5. **Guestbook** — wishes wall (sample wishes + an input).
6. **Gift** — gift/blessing section.
7. **Floating dock** — music toggle, share, add-to-calendar.
8. Where the reel's flow allows, also include **story timeline**, **photo gallery**
   (placeholder slots + captions), and **details cards** — these are groom-toggleable
   sections in Dawa.

## 5. Output A — one self-contained HTML mockup

- A single `.html` file. No external requests except Google Fonts. All CSS/JS inline; all
  ornament code-drawn. Animations via CSS animations/transitions, Web Animations API, or
  requestAnimationFrame.
- Two config objects at the top of the file:
  - `CONTENT` — every editable string, bilingual `{ar, he}`, plus photo placeholder URLs.
  - `TOKENS` — the palette expressed in Dawa's theme-token shape (see §6).
- Respect `prefers-reduced-motion`: provide a static-but-complete experience.
- The file must run by double-clicking it — that is how I review it.

## 6. Output B — companion spec (markdown)

1. **Template name + one-line mood description** (bilingual name suggestion).
2. **Shot list** from §1.
3. **Palette as Dawa theme tokens** — the reel's exact colors mapped onto this structure
   (this is Dawa's `digitalThemes` shape; fill every key):
   `key, label_ar, label_he, swatch, bg, overlay, text, textSoft, accent, accentMuted,
   accentLine, gradientStops[3], monoStops[3], eyebrow, petal, sparkle, sparkleGlow,
   chipBg, chipBorder, cardBg, cardBorder, successBg, successBorder, rsvpAttending,
   rsvpAbsent`.
   Note contrast: `text` on `bg` and pill/chip pairs should meet WCAG AA; flag any pair
   that required adjusting away from the reel.
4. **Typography** — families chosen (AR + HE), where each is used, sizes/weights, and why
   they're the closest Google-Fonts match to the reel.
5. **Motion inventory** — every animation: trigger, duration, easing, what moves. This is
   the port's contract, so be exhaustive.
6. **Section map** — reel timeline → mockup sections → which Dawa block (§4) each one
   fulfills. Explicitly flag anything that has **no Dawa equivalent today** (new-component
   candidates for the port).
7. **Asset inventory** — each code-drawn ornament, each placeholder slot.
8. **Port notes** — this template ships with Dawa's 3D envelope OFF
   (`envelopeEnabled: false`); note anything expressible through Dawa's existing knobs
   (custom `background`, `starfield` controls) vs. what needs new code.
9. **Soundtrack** — mood/tempo description only.

## 7. Working order

Shot list → sealed state + intro → sections in reel order (weaving §4) → dock + toggle →
spec. Then verify against this checklist and state the result of each item:

- [ ] All 8 mandatory blocks present and restyled to the reel
- [ ] Sealed guest-name + tap gate works; nothing moves before the tap
- [ ] AR/HE toggle switches every string; Arabic renders with joined letters
- [ ] No external assets beyond Google Fonts; file runs standalone
- [ ] `CONTENT` + `TOKENS` objects complete
- [ ] Spec sections 1–9 all filled
