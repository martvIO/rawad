# Session Logs — Dawa Platform

_Append-only. Never overwrite history. Most recent session at the top._

---

## DATE: 2026-05-26

**GOAL:** Resolve the two open bugs in [KNOWN_BUGS.md](../KNOWN_BUGS.md) — BUG-O002 (uploaded files never appear in gallery despite success toast) and BUG-O003 (only a subset of parallel uploads visible).

**FILES CHANGED:**
- `functions/src/api/routes/digital.ts` — wrapped media upload, media delete-item, and mockup-upload handlers in `fs().runTransaction(...)` to make their read-modify-write atomic.
- `src/services/digitalInvitation.js` — `subscribeDigitalMedia` and `subscribePhotographerFiles` (via `pollList`) now accept an optional `transform(serverResult) => result` callback that runs on every poll result; `uploadPhotographerFile` returns the full record (`{ id, url, storagePath, name, type, uploadedAt, key }`) so callers can register an optimistic entry without a second round trip.
- `src/pages/portal/groom/digital/DigitalDashboard.jsx` + `DigitalPhotographer.jsx` — added `pendingPathsRef` / `pendingFilesRef` Maps that track recently-confirmed uploads. The poll transform splices missing entries back in until the server echoes them; deletes also clear from the map so a poll mid-delete can't resurrect just-deleted entries.
- `src/hooks/usePortalState.js` — added `currentUid` to the return object (was declared on line 85 but never exported).
- `src/__tests__/services/services.test.js` — updated the photographer upload test to match the widened return shape.
- `KNOWN_BUGS.md` — moved BUG-O002 and BUG-O003 to Resolved with full root-cause writeups and verification notes.
- `memory/gotchas.md` — new file capturing 3 reusable lessons from this session.

**TESTS:**
- `cd functions && npm run build` — clean.
- `npm run test:unit` — 402/404 passing. The 2 remaining failures are pre-existing `buildApiUrl` tests (verified by stashing the diff and re-running) unrelated to this work.
- Playwright drove the deployed `dawa-aa793.web.app` site: dashboard rendered the existing 10 media items (was rendering 0 due to BUG-O002's primary cause); 3-file parallel upload landed all 3 (10 → 13, server-confirmed); single upload survived 35 s / multiple poll cycles without vanishing (14 stable); photographer page tested with 2-file parallel upload (8 → 10, stable).

**PROBLEMS FOUND:**
1. **BUG-O003 root cause** — `digital.ts` upload handler did `get()` → splice → `set({ media: [...] })` as 3 separate steps. Parallel uploads from `Promise.allSettled` each read the same `existing` and wrote `[existing, file_i]`; later writes clobbered earlier ones, leaving only the last upload in Firestore.
2. **BUG-O002 secondary cause** — the 15s poller blindly replaced local state via `setDoc(serverResult)`. A poll already in flight when an upload commits lands its pre-upload snapshot after the optimistic merge and wipes the just-uploaded entry.
3. **BUG-O002 primary cause (uncovered during Playwright verification)** — `usePortalState.js` declared `const currentUid = authUser?.uid ?? null` on line 85 but never included it in the return block on line 930. The dashboard / photographer subscriptions early-bailed on `if (!currentUid) return` and never polled. Uploads still worked via `getStoredUid()` fallback, but a reload left an empty gallery because no subscription was reading the server. Caught by walking the React fiber from a Playwright `browser_evaluate` and reading the `doc` useState directly.

**FIXES:** All three above. See FILES CHANGED.

**ARCHITECTURE DECISIONS:**
- Picked Firestore transactions over `FieldValue.arrayUnion()` because the upload handler also needs to migrate legacy `backgroundUrl` docs into `media[]`, which `arrayUnion` can't express. Transaction also handles the delete and mockup-upload paths uniformly.
- Picked "track pending paths + merge in poller" over "pause poller during uploads" because pausing pauses all refreshes (e.g. other-tab changes); the merge preserves optimistic items only and lets other state continue refreshing on schedule.

**QUESTIONS:** None outstanding from this session.

**NEXT TASKS:**
- Commit + push the diff (held back pending user approval at end of session).
- Consider auditing other `usePortal()` destructuring sites for fields that aren't in the return block — see [memory/gotchas.md](gotchas.md).

**COMMITS:** None yet — diff staged, awaiting approval.

---

## DATE: 2026-05-24

**GOAL:** Run autonomous engineering startup sequence — inspect codebase and create all missing project documentation files from actual code.

**FILES CHANGED:**
- `memory/current_state.md` — created
- `memory/completed.md` — created
- `memory/future_ideas.md` — created
- `memory/session_logs.md` — created (this file)
- `README.md` — rewritten (was stale / referred to localStorage)
- `PROJECT_CONTEXT.md` — created
- `AI_RULES.md` — created
- `FILE_INDEX.md` — created
- `DECISIONS.md` — created
- `KNOWN_BUGS.md` — created
- `TASKS.md` — created
- `CHANGELOG.md` — created
- `API_CONTRACTS.md` — created
- `DATABASE_SCHEMA.md` — created
- `TESTING.md` — created
- `docs/architecture.md` — created
- `docs/security.md` — created
- `docs/deployment.md` — created
- `docs/auth_flow.md` — created
- `docs/testing_strategy.md` — created
- `docs/firebase_structure.md` — created
- `examples/good_patterns.md` — created
- `examples/bad_patterns.md` — created

**TESTS:** None run in this session (documentation-only session).

**PROBLEMS FOUND:**
1. README.md was completely stale — referenced localStorage, old credentials, old project structure.
2. `re.js` at project root is unused (reCAPTCHA Enterprise sample).
3. `face-api.js` added as dependency but usage unclear — potential large bundle impact.
4. `dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json` service-account key still in project root.
5. CLAUDE.md has outdated "Current State" describing pre-REST architecture (but core architecture section is still accurate).
6. The `functions/src/index.ts` exports both the new `api` Express function and the legacy callable Cloud Functions — migration may not be complete.

**FIXES:** None (documentation-only session).

**ARCHITECTURE DECISIONS:** Documented existing decisions in DECISIONS.md. Major discovery: the project has migrated from Firebase SDK direct calls to a full REST API layer, with custom tokenManager/apiClient/poller replacing the Firebase Auth SDK and RTDB subscriptions.

**QUESTIONS:**
1. Is `face-api.js` actively used anywhere in the codebase? If not, should it be removed?
2. Are the legacy callable Cloud Functions (`createPortalUser`, `deletePortalUser`, etc.) still called by any frontend code, or has everything migrated to the REST API?
3. Should the service-account JSON file be deleted from the project root?

**NEXT TASKS:**
1. Audit `face-api.js` usage — `grep` for imports.
2. Check which legacy Cloud Function callables are still called from the frontend.
3. Run `npm run test:unit` to verify unit test suite passes.
4. Fix DigitalAddGuest submit bug (see KNOWN_BUGS.md).

**COMMITS:** None (documentation-only, no code changed).
