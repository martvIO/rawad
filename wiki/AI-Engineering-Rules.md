---
date: 2026-05-26
sources:
  - AI_RULES.md
tags: [rules, workflow, conventions, reference]
---

# AI Engineering Rules

Rules for any AI agent or engineer working on [[Dawa]] (full text in `AI_RULES.md`).

## Session start
Read `memory/current_state.md`, [[Known Bugs]], and [[Tasks Backlog]] before acting. Verify current code state — don't rely solely on memory.

## Code
- **Separation of concerns:** UI → components/pages; logic → hooks/services; Firebase access → `src/services/` only; utilities → `src/utils/`. Never put Firebase calls in UI components.
- **No duplication:** check `src/utils/`, `src/config/index.js`, `src/constants/`, and `theme.js` before adding functions, constants, or colors.
- **File size:** flag files >300–500 lines as refactor candidates.
- **Comments:** explain WHY, never WHAT.
- **Styling + i18n:** see [[Inline Styling Convention]] — inline only, tokens from `theme.js`, all strings through `t(key)` in both `ar.js` and `he.js`.

## Testing
Every feature needs tests before session end. Run `npm run test:unit` (logic) and `npm test` (rules). Never claim tests passed without running them. For UI changes, verify in a live browser with the **Playwright MCP** (`http://localhost:8931/mcp`) and screenshot — code review alone is insufficient.

## Security
Never weaken rules, `assertAdmin()`, `requireAuth`, rate limits, or input validation. Always test security changes with rule tests. See [[Security Model]].

## What NOT to do
No fabricated APIs/routes/schemas, no silent feature removal, no placeholder stubs, no unrelated rewrites during a fix, no assumed requirements (ask instead), no committing the service-account JSON. When uncertain about requirements: **STOP and ask**.
