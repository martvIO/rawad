# AI Engineering Rules — Dawa

Rules for any AI agent or engineer working on this codebase.

---

## Session Start Protocol

At the start of every session:

1. Read `memory/current_state.md` — understand where the project is
2. Read `KNOWN_BUGS.md` — understand what's broken
3. Read `TASKS.md` — understand what's pending
4. Inspect changed files if memory seems stale (check git log)

Do NOT rely solely on memory. Verify current code state before acting.

---

## Code Rules

**Separation of concerns**
- UI → components and pages
- Business logic → hooks and services
- Firebase access → services only (`src/services/`)
- Utilities → `src/utils/`
- Never place business logic or Firebase calls directly in UI components

**No duplication**
- Before writing a utility function, check if one exists in `src/utils/`
- Before writing a constant, check `src/config/index.js` and `src/constants/`
- Before adding a color, check `src/styles/theme.js` — the `C` export owns all palette values

**File size**
- When a file exceeds ~300–500 lines, flag it as a refactor candidate in TASKS.md
- Break large files into focused modules

**Comments**
- Write comments only when the WHY is non-obvious
- Never comment what the code does — only why it must do it that way
- Bad: `// increment i`
- Good: `// normalize +972 and local prefixes before matching because confirmation submissions arrive in multiple formats`

**Styling**
- Inline styles only. No CSS files, no Tailwind, no styled-components.
- Use tokens from `src/styles/theme.js`: `C.gold`, `C.bg`, `ROLE.admin.color`, `S.fieldLabel`
- Do not hardcode hex colors

**i18n**
- All user-visible strings go through `t(key)`. No bare English/Arabic/Hebrew strings in JSX.
- Add new keys to both `src/i18n/ar.js` and `src/i18n/he.js`

---

## Testing Rules

- Every new feature needs tests before the session ends
- Never claim tests passed without running them
- Run `npm run test:unit` for pure logic; `npm test` for security rules
- Fix failures — never suppress or skip them
- When tests fail: inspect stack trace → isolate root cause → fix → rerun → document

---

## Security Rules

Never weaken:
- `database.rules.json` rules
- `storage.rules` rules
- `assertAdmin()` in `functions/src/helpers.ts`
- `requireAuth` middleware in `functions/src/api/middleware/auth.ts`
- Rate limits in any route
- Input validation on any Cloud Function or API route

Never bypass ownership or role checks.
Always test security modifications with rule tests.

---

## Git Rules

- Only commit after tests pass
- Never commit failing code
- Never commit untested code
- Commit style: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `security:`, `perf:`
- Commit body must include WHY, WHAT, and any RISKS

---

## Documentation Rules

Update documentation whenever:
- A file is added or removed
- A route changes
- An API contract changes
- A schema changes
- Firebase rules change
- A new component, hook, or service is added

Files to update: `FILE_INDEX.md`, `API_CONTRACTS.md`, `DATABASE_SCHEMA.md`, and the relevant `docs/` file.

---

## What NOT To Do

- Do not fabricate APIs, routes, schemas, or implementations
- Do not silently remove features
- Do not rewrite unrelated files during a bug fix
- Do not create placeholder / stub implementations
- Do not assume requirements — ask when uncertain
- Do not add features beyond what the task requires
- Do not add error handling for impossible cases
- Do not add backwards-compatibility shims when you can just change the code
- Do not commit the service-account JSON file

---

## Questions Protocol

When uncertain about requirements: **STOP and ask**.

Examples of things to ask rather than assume:
- Should GPS be mandatory for guests?
- Should invite tokens expire before 90 days?
- Should drivers see other drivers' locations?
- Should this move from RTDB to Firestore?
