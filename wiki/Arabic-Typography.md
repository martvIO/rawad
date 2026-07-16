# Arabic Typography — joins and clipping

The repo-wide convention for rendering Arabic script correctly, established 2026-07-16
and enforced by the `.agents/skills/arabic-typography` skill.

## The two defect classes

1. **Broken joins.** Arabic is cursive — letters connect inside a word. *Any* positive
   `letter-spacing` inserts space inside words and severs the joins; there is no
   join-safe positive value. Hebrew and Latin are not cursive and may keep tracking
   as a design flourish.
2. **Clipping.** Plain text ink overflows its line box freely and never clips; glyph
   edges get cut only inside a *clip context* — `background-clip: text` gradients
   (the gradient paints only inside the padding box; ink outside renders
   transparent), `overflow: hidden` on the text node itself, or RN Android text
   boxes. Amiri (the display font, see [[Visual Design System]]) has the tallest
   ascenders / deepest descenders / stacked diacritics, so gradient headings need
   `paddingBlock` headroom (~0.15–0.2em).

## The mechanisms (as shipped)

- **`frontend/src/utils/arabicType.js`** — `hasArabic(str)` + `track(str, px)`:
  content-aware tracking that returns the designed value for Latin/Hebrew and `0`
  for Arabic. Used on the landing page (i18n/admin-editable strings) and anywhere
  `lang` isn't in scope.
- **`lang === "he" ? px : 0` conditionals** — used in portal/editor labels and
  digital-template chrome where `lang` is in scope.
- **Classic template** — `.dawa-inv[lang="ar"]` CSS reset block in
  `InviteStyles.jsx` normalizes the global `.4px` flourish and every per-element
  tracking (incl. `.dawa-inv-venue-city`, added this pass) when the invite renders
  in Arabic. All gradient (`.dawa-inv-grad`) classes carry `padding-block`.
- **Destination Love template** — `.tpl-dl { letter-spacing: 0 }` base with
  `.dl-track` as a Latin/Hebrew-only opt-in; the 2026-07-16 pass fixed inline
  styles and `.dl-track` usages that had leaked onto Arabic content (`بطاقة صعود`
  at `.28em` was the worst), and gave the `.dl-grad` section titles em-scaled
  `paddingBlock`.

## Deliberate KEEPs (not defects)

Tracking is fine on content that is Latin/digit-only *by construction*: OTP/phone
inputs (`letterSpacing: 6` + `dir=ltr`), monospace temp passwords, IBAN displays,
hardcoded Latin kickers (PREMIUM, DIGITAL, LUXURY PRINT), star glyphs, AR/HE
toggle chips, and `String(i).padStart(2,"0")` step numbers. Arabic-initial
monograms are guarded content-aware (`hasArabic(monogram)`).

## Related

[[Visual Design System]] · [[Digital Invitations]] · [[Inline Styling Convention]]
— and the skill: `.agents/skills/arabic-typography/SKILL.md` (scan → classify
FIX/KEEP → fix → verify in browser).
