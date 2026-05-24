# Tasks — Dawa

_Prioritized task list. Move completed tasks to memory/completed.md._

---

## Priority: High (blocking or broken features)

### TASK-001 — Fix DigitalAddGuest submit hang (BUG-001)
- Investigate Firestore write in `src/services/digitalInvitation.js`
- Check Firestore rules for `digitalGuests/{uid}/guests` write permission
- Fix unhandled rejection or state bug
- Add unit test covering the add-guest service call
- See KNOWN_BUGS.md BUG-001

### TASK-002 — Fix photo upload stuck state (BUG-002)
- Trace upload lifecycle in `DigitalDashboard.jsx` and `DigitalPhotographer.jsx`
- Ensure upload completion clears the uploading flag regardless of subscription callbacks
- See KNOWN_BUGS.md BUG-002

---

## Priority: Medium (technical debt, quality)

### TASK-003 — Audit and remove or justify `face-api.js`
- `grep` all source files for any `face-api.js` import
- If unused: remove from `package.json`, rebuild, confirm bundle shrinks
- If used: document where and why in FILE_INDEX.md

### TASK-004 — Delete `re.js` from project root
- File is an unused reCAPTCHA Enterprise sample
- Confirmed not imported anywhere
- Safe to delete

### TASK-005 — Identify and remove stale legacy callable Cloud Functions
- Determine which HTTPS callables in `functions/src/` are still called from the frontend vs. migrated to the REST API
- Remove the stale ones and clean up `functions/src/index.ts` exports
- Update FILE_INDEX.md

### TASK-006 — Write REST API route tests
- No automated tests cover the Express API routes in `functions/src/api/routes/`
- Add integration or unit tests for at minimum: `auth.ts`, `users.ts`, `guests.ts`, `confirmations.ts`

### TASK-007 — Document `seed-emulator.cjs`
- Verify `scripts/seed-emulator.cjs` creates a complete, usable emulator state
- Document what it seeds and how to use it in `docs/deployment.md`

### TASK-008 — Rotate or remove service-account key from project root
- `dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json` is in the project root
- Store it securely (Google Cloud Secret Manager or team password manager)
- Delete the local copy

---

## Priority: Low (improvements, nice-to-have)

### TASK-009 — Code-split the portal by route
- Use `React.lazy()` + `<Suspense>` on admin/driver/groom portal sub-trees
- Reduces initial bundle size (currently ~775 KB + face-api if not removed)

### TASK-010 — Add GitHub Actions CI pipeline
- Lint + unit tests on every PR
- Integration tests on merge to main
- Block merge if tests fail

### TASK-011 — Extend SMOKE_TEST.md into Playwright script
- `docs/SMOKE_TEST.md` describes manual smoke tests
- Automate as Playwright tests for post-deploy verification

### TASK-012 — Update CLAUDE.md "Current State" section
- The existing `CLAUDE.md` at root has an outdated "Current State" section describing the pre-REST architecture
- Update to reflect the REST API migration and new files
