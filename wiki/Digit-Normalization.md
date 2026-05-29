---
date: 2026-05-28
sources:
  - src/utils/digits.js
  - src/utils/apiClient.js
  - scripts/migrate-arabic-digits.cjs
tags: [i18n, convention, concept, arabic, formatting]
---

# Digit Normalization

[[Dawa]] standardizes on **Western ASCII digits (0-9) everywhere** — in the UI, in stored data, and in invite content. Arabic-Indic numerals (٠-٩) and Persian/Extended Arabic-Indic (۰-۹) are never displayed or persisted, even though the audience is Arabic/Hebrew speaking.

**Why:** mixed digit systems looked inconsistent across the app (counts were already forced to Western via `toLocaleString("en")`, but dates and user input were not). The product decision is one digit system, Western, for visual consistency and reliable matching.

## Three enforcement points

1. **Display — dates/times.** Every Arabic-locale `toLocale*` call passes `numberingSystem: "latn"` in its options. This keeps Arabic month/day names but forces Western digits (`15 أغسطس 2026`, not `١٥ أغسطس ٢٠٢٦`). Plain number rendering (`{count}`, `toLocaleString("en")`) was already Western.
2. **Input — going forward.** `src/utils/digits.js` exports `toWesternDigits()` (string) and `westernizeDeep()` (recursive, returns a new value). `apiClient.js` runs `westernizeDeep` on every request body before send, so the database only ever receives Western digits. **Password fields are preserved** (`PRESERVE_KEYS`) — rewriting them would break auth. `PhoneInput` also normalizes raw input so typed Arabic-Indic digits convert instead of being dropped by its `\D` strip.
3. **Existing data — one-time migration.** `scripts/migrate-arabic-digits.cjs` (`npm run migrate:digits`) walks RTDB + Firestore and converts stored Arabic-Indic digits. **Dry-run + emulator by default**; `--commit` writes, `--prod` targets production (needs `GOOGLE_APPLICATION_CREDENTIALS`). It reuses the same digit map via dynamic import so the mapping can't drift. Not yet run against production.

Ties into the [[Inline Styling Convention]] / [[AI Engineering Rules]] (no bare formatting), the [[REST API Architecture]] (apiClient is the single client→DB write chokepoint), and [[Data Storage Model]] (migration targets).
