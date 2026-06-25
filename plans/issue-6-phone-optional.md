# Plan (for review): Issue 6 — make phone truly optional

> **Status: awaiting your go-ahead.** You asked me to plan this before touching
> anything DB/Auth-related. Nothing here is implemented yet.

## TL;DR — it's smaller and safer than the audit implied

The audit flagged this as an RTDB `.validate` / `phoneIndex` / Auth change. **It
isn't — the backend and the rules already support a phone-less user.** The only
thing forcing a fake phone is a stale **client** workaround. So this is a
one-file frontend change plus a release-ordering note, with **no rules/DB/Auth
code change required.**

## Evidence (current code already optional end-to-end)

| Layer | State today |
|---|---|
| RTDB rule | [database.rules.json:21](../database.rules.json#L21) — `"phoneE164": ".validate": "!newData.exists() \|\| (isString && matches +E.164)"`. **Absent phone is already valid.** |
| `phoneIndex` | Written only when a phone is supplied — [userStore.ts:155](../backend/functions/src/domain/users/userStore.ts#L155) (`if (phoneIdx)`) and [users.ts:204](../backend/functions/src/api/routes/users.ts#L204). |
| Domain `createUser` | [userStore.ts:99-128](../backend/functions/src/domain/users/userStore.ts#L99-L128) — `hasPhone` gates phone validation, the Auth `phoneNumber`, the index write, and `profile.phoneE164`. |
| Route `POST /users` | [users.ts:196-228](../backend/functions/src/api/routes/users.ts#L196-L228) — same `hasPhone` gating; body doc literally says `phoneE164?` and "phoneIndex … only if phone supplied". |
| Firebase Auth | An email/password account (synthetic `username@dawa.local`) needs no `phoneNumber`; login is username/password, so phone-less users can still sign in. |

**The only blocker is the client:** [usePortalUsers.js:132-138](../frontend/src/hooks/portal/usePortalUsers.js#L132-L138)
fabricates `"+1202555" + (Date.now() % 10000)` when the phone field is blank. Its
own comment says the hack is removed *after* the new Cloud Function ships — and
that function (the refactored, phone-optional `createUser`/route above) is already
in the tree.

## The change

1. **Frontend only** — in `usePortalUsers.js addUser`, stop fabricating a number.
   When `newUserPhone` is blank, send **no `phoneE164`** (omit the field) instead
   of the `+1202555…` placeholder. Remove the placeholder line and its
   now-obsolete Arabic comment block.
2. **Nothing else.** No `database.rules.json` edit, no `phoneIndex` change, no
   Auth/`createUser` change — they already do the right thing when phone is absent.

> If you'd rather be belt-and-suspenders, I can add one unit test asserting the
> route creates a user with no `phoneE164` (no Auth `phoneNumber`, no `phoneIndex`
> write) — exercising the already-supported path so it can't regress.

## Release ordering (the one real caveat)

The fabrication exists because the **deployed** backend predates the
phone-optional refactor (auto-deploy has been on hold since 2026-06-13). Since the
client change and the refactored backend live in the **same tree**, they ship
together on the next deploy, so the ordering ("backend optional → then drop the
hack") is satisfied automatically. **Do not cherry-pick the client change ahead of
a backend deploy** — against an old prod backend, a phone-less create would 400.

## Out of scope (flagging, not doing)

- Existing users already carrying a fabricated `+1202555…` number are untouched.
  A one-off cleanup (null those phones / clear stale `phoneIndex` entries) could
  be a separate, optional follow-up — say the word and I'll plan it.

## Verification (once you approve)

- Unit: (optional) the no-phone create test above — `npm run test:unit`.
- Browser (per CLAUDE.md): emulator + admin UI → create a user with the phone
  field blank → expect success (no `+1202555…` anywhere), then log in as that
  user. Drive via the Playwright MCP.

## Decision needed from you

- Proceed with the **client-only** change as described? (No DB/Auth change.)
- Include the optional no-phone backend unit test? (recommended)
- Want the stale-`+1202555` cleanup planned as a follow-up, or leave existing rows?
