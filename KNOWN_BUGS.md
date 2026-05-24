# Known Bugs — Dawa

_Track open bugs here. Mark resolved bugs with the fix date. Never delete entries — move them to a "Resolved" section._

---

## Open Bugs

### BUG-001 — DigitalAddGuest form submission hangs

**File:** `src/pages/portal/groom/digital/DigitalAddGuest.jsx`
**Severity:** High — feature is broken
**Symptom:** Submit button spins forever. No data is saved to Firestore. No visible error.
**Suspected cause:** Unknown. Could be a Firestore write permission issue after login, a service call returning a rejected promise that isn't caught, or a state update on an unmounted component.
**To investigate:**
1. Open browser DevTools → Network tab → filter for Firestore requests
2. Check for console errors from the `[dawa]` logger
3. Inspect `src/services/digitalInvitation.js` → `addDigitalGuest` for unhandled rejections
4. Check Firestore rules for `digitalGuests/{uid}/guests` write permission

---

### BUG-002 — Photo upload state stuck on "uploading..." after success

**Files:** `src/pages/portal/groom/digital/DigitalDashboard.jsx`, `src/pages/portal/groom/digital/DigitalPhotographer.jsx`
**Severity:** Medium — misleading UI
**Symptom:** After a file uploads successfully to Firebase Storage, the UI continues showing an "uploading..." state and never clears.
**Suspected cause:** The upload completion callback updates state correctly, but a component re-render or re-subscription resets the state before the user sees the success.
**To investigate:**
1. Add console logs at the start and end of the upload handler
2. Check if the Firestore `onSnapshot` listener fires immediately after upload and overwrites local state

---

## Resolved Bugs

### BUG-R001 — tsc incremental cache causing stale exports (Resolved 2026-05)

**Fix:** `scripts/build-functions.cjs` now wipes both `functions/lib/` and `functions/tsconfig.tsbuildinfo` before every tsc run.

---

### BUG-R002 — Storage 403 on digitalMedia / photographerFiles (Resolved 2026-05)

**Fix:** `firebase deploy --only storage` was run to deploy the correct rules. Rules had been written but never deployed.

---

### BUG-R003 — RTDB write after login silent rollback (Resolved 2026-05)

**Fix:** Digital invitation data moved from RTDB to Firestore, which proved stable for the write-after-login pattern.

---

### BUG-R004 — `PASSWORD_LOGIN_DISABLED` Firebase error (Resolved 2026-05)

**Fix:** Email/Password sign-in method was not enabled in Firebase Console. Enabled under Authentication → Sign-in method.

---

### BUG-R005 — Guest invite link confirmation not showing in AdminConfirmationsTab (Resolved 2026-05)

**Fix:** `submitGuestInvite` now writes a `/confirmations` row and sets `confirmedAt` on the guest record. The phone-match in `submitConfirmation` also runs unconditionally (not only when GPS coords present).
