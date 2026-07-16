---
name: arabic-typography
description: Find and fix Arabic script rendering defects — broken letter joins from letter-spacing, and clipped glyph edges from tight line-height, overflow, or gradient text. Use when Arabic text shows gaps inside connected words or cut-off letters, when auditing typography across the web app or Expo app, or before adding letterSpacing, lineHeight, overflow, or background-clip styles to any text element.
license: MIT
metadata:
  author: dawa
  version: "1.0"
---

# Arabic typography — joins and clipping

Arabic is a cursive script: letters **join** inside a word, and glyphs rise and fall far past Latin metrics (ascenders ا ل ط, final-form descenders ج ح ع م, stacked diacritics). Two defect classes follow, each with one physical cause:

- **Broken joins** — any positive `letter-spacing` inserts space *inside* words, visually severing the joins. There is no "subtle" tracking for Arabic; the only safe values are `0` / `normal`.
- **Clipping** — plain text ink may overflow its line box freely, so tight line-height alone never clips; glyph edges get cut only inside a *clip context*: `background-clip: text` (the gradient paints only inside the padding box — ink outside it renders transparent), `overflow: hidden` on the text node itself, or React Native Android text boxes.

## Repo context

- `frontend/index.html` sets `<html lang="ar" dir="rtl">` — **every element can render Arabic** unless its content is Latin-only by construction.
- Styling is ~100% inline JSX (`letterSpacing`, camelCase) per [[Inline Styling Convention]], plus CSS strings in `frontend/src/styles/GlobalStyle.jsx` and `frontend/index.html`. Global CSS cannot override inline styles — fix at each usage site.
- Display font is **Amiri** (worst-case vertical metrics); UI font Cairo.
- `app/` is the Expo React Native groom app — same rules via `StyleSheet` (`letterSpacing`, `lineHeight` in absolute px).

## Steps

### 1. Scan

Collect every candidate with one pass (run from the repo root):

```bash
# joins — every tracking declaration, web + native
grep -rn --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
  --include='*.html' --include='*.css' -e 'letterSpacing' -e 'letter-spacing' \
  frontend/src frontend/index.html app/src app/app 2>/dev/null | grep -v node_modules

# clipping — tight line-heights (unitless < 1.4)
grep -rnE "lineHeight: *'?(0?\.[0-9]+|1(\.[0-3][0-9]?)?)'?\s*[,}]" \
  frontend/src app/src app/app --include='*.js*' --include='*.ts*' 2>/dev/null | grep -v node_modules

# clipping — gradient text and hidden overflow on text nodes
grep -rn -e 'WebkitBackgroundClip' -e 'backgroundClip' -e 'background-clip' \
  frontend/src frontend/index.html 2>/dev/null | grep -v node_modules
```

**Done when:** a hit list exists in which every `letterSpacing` / `letter-spacing` occurrence in the repo appears exactly once.

### 2. Classify

Every hit gets exactly one verdict — no hit skipped:

- **FIX** — the element can render Arabic: content from `i18n/` (AR+HE), user data (names, venues, wedding titles), or any mixed-language UI string. Fix with `frontend/src/utils/arabicType.js`: `track(str, px)` returns the designed tracking for Latin/Hebrew and `0` for Arabic content, `hasArabic(str)` guards class toggles; where `lang` is in scope, `lang === "he" ? px : 0` matches the template convention (`.dawa-inv[lang="ar"]` resets, `.dl-track` opt-ins).
- **KEEP** — the element renders only Latin/digits *by construction*: hardcoded English constants, tabular numbers, tokens/codes, brand latinisms. Uppercase Latin "kicker" labels with wide tracking are the classic KEEP (`text-transform: uppercase` is a no-op on Arabic and never a defect by itself).
- **Uncertain → FIX.** A KEEP that later receives Arabic content regresses silently; tracking is decoration, joins are legibility.

To judge, trace what string flows into the element (i18n key, prop, constant) — never classify from the style alone.

### 3. Fix

| Defect | Rule |
|---|---|
| Tracking on Arabic-capable text | `track(str, px)` / lang conditional — never a smaller positive value |
| `background-clip: text` | Keep the gradient, but guarantee headroom: vertical padding (`paddingBlock` ≥ 0.15em, em-scaled for fluid type) so Amiri's ascenders/descenders/diacritics stay inside the paint box. Tight `lineHeight` on *plain* text is not a clipping defect — ink overflow paints fine |
| `overflow: hidden` on the text element itself | Move the clip to a wrapper, or pad the text box vertically. `textOverflow: ellipsis` truncation is fine — it shortens, it doesn't sever joins |
| React Native (`app/`) Arabic `<Text>` | Never set `letterSpacing`; set `lineHeight ≥ round(fontSize × 1.5)`; on Android do not set `includeFontPadding: false` on Arabic text |
| Hebrew | Not cursive — tracking doesn't sever joins, but avoid it on text with niqqud; all clipping rules apply unchanged |

**Done when:** every FIX from step 2 is applied and no KEEP was altered.

### 4. Verify

Drive the worst-case surfaces in a real browser (Playwright MCP, mobile-width viewport): the Amiri display headings on the digital invitation (`/d/…` demo route), the landing hero, and any screen changed in step 3. Inspect the largest headings for severed joins and for cut edges on deep descenders (ج ح خ ع) and diacritics.

**Done when:** every changed screen is screenshotted post-fix with no visible broken joins or clipped glyph edges.
