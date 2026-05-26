---
date: 2026-05-26
sources:
  - DECISIONS.md
  - AI_RULES.md
tags: [styling, frontend, convention, concept]
---

# Inline Styling Convention

[[Dawa]] uses **100% inline styles** — no CSS framework (Tailwind, Bootstrap), no CSS modules, no styled-components. Every component uses inline `style={}` props.

**Why:** the original 4,858-line `App.jsx` used inline styles exclusively; migrating to a framework would introduce regressions without value. Design tokens prevent inconsistency without a build-time CSS step.

## Tokens live in `src/styles/theme.js`
Use the exports, never hardcode hex:
- `C` — palette (`C.gold`, `C.bg`)
- `ROLE` — per-role colors (`ROLE.admin.color`) — ties to [[User Roles]]
- `S` — shared style fragments (`S.fieldLabel`)

`GlobalStyle.jsx` handles the few global rules. Per [[AI Engineering Rules]]: check `theme.js` before adding any color, and route all user-visible strings through `t(key)` (Arabic + Hebrew i18n), never bare strings in JSX.
