# Known Bugs — Dawa

_Track open bugs here. Mark resolved bugs with the fix date. Never delete entries — move them to a "Resolved" section._

---

## Open Bugs

### BUG-O002 — `POST /api/digital/{uid}/media/upload` returns 400 `api_invalid_multipart`

**Severity:** High — groom cannot upload invitation media (images/video) via the digital dashboard
**Symptom:** Console logs:
```
POST https://dawa-aa793.web.app/api/digital/MkijWMawYOc4RcPooW5mgcIpLYX2/media/upload 400 (Bad Request)
[dawa] apiClient POST /digital/.../media/upload  api_invalid_multipart api_invalid_multipart
[dawa] addInvitationMedia ApiError api_invalid_multipart
```
**Root cause:** Unknown — `parseMultipart(req, MAX_INVITE_MEDIA_BYTES)` in `functions/src/api/routes/digital.ts` throws / rejects, causing the handler to return `{ error: "api_invalid_multipart" }`. Possible causes: missing or incorrect `Content-Type: multipart/form-data` boundary sent by the client, file size exceeding `MAX_INVITE_MEDIA_BYTES`, or a busboy parsing regression.
**Call site:** `DigitalDashboard.jsx` → `handleAddMedia` → `addInvitationMedia` (`src/services/digital.js`) → `api.upload('/digital/{uid}/media/upload', formData, opts)`
**Next steps:** Check `firebase functions:log --project dawa-aa793` for the stack trace on the `/api/digital/:uid/media/upload` handler. Verify the FormData object contains the file field name expected by `parseMultipart`. Check `MAX_INVITE_MEDIA_BYTES` against actual file sizes used in testing.

---

### BUG-O001 — `GET /api/proofs/url` returns 500 → proof photos fail to load

**Severity:** High — groom/admin cannot view proof photos uploaded by drivers
**Symptom:** Console logs:
```
[dawa] apiClient GET /proofs/url?path=proofs%2F… api_url_failed api_url_failed
[dawa] proof.url ApiError api_url_failed
GET https://dawa-aa793.web.app/api/proofs/url?path=proofs%2F… 500 (Internal Server Error)
```
The poller retries the call on every tick, flooding the console repeatedly.
**Root cause:** Unknown — the `/proofs/url` Cloud Function endpoint throws a 500. Possible causes:
Storage admin SDK permissions, missing `WEB_API_KEY` / Secret Manager config, or a regression
in the `proofs` router after a recent deploy.
**Related:** Similar symptom to BUG-R007 (which was a CSP block), but this is a 500 from the
server rather than a client-side network block, so the CSP fix is not the cause.
**Next steps:** Check `firebase functions:log --project dawa-aa793` for the stack trace on the
`/api/proofs/url` handler. Verify `WEB_API_KEY` is set in the Functions environment and that
the Storage service account has `storage.objects.get` permission.

---

## Resolved Bugs

### BUG-R008 — DigitalAddGuest submit button hangs for 30 seconds (Resolved 2026-05)

**File:** `src/pages/portal/groom/digital/DigitalAddGuest.jsx`
**Severity:** High — form appeared broken; CSP masked the actual API error
**Root cause:** Same CSP block as BUG-R006. `POST /api/digital/{uid}/guests` was blocked by
the production CSP, causing `api.post` to timeout after 30 s (`API_TIMEOUT_MS.DEFAULT`). The
button showed a spinner for the full timeout duration before the error toast appeared.
**Fix:** CSP fix (BUG-R006) — the `POST` now routes same-origin without CSP violation.

---

### BUG-R009 — Photographer upload gallery clears after every successful upload (Resolved 2026-05)

**File:** `src/pages/portal/groom/digital/DigitalPhotographer.jsx`
**Severity:** Medium — gallery briefly showed empty after upload until Firestore polled
**Root cause:** After each upload, the code called `listPhotographerFilesFromStorage()` which
is a no-op stub always returning `[]`. This set `storageFiles = []` and deleted the localStorage
cache. The display merged Firestore + Storage, so newly uploaded files vanished until the next
Firestore poll (up to `POLL_MS.DIGITAL` ms). Also: no `try/finally` around the upload block
meant an unexpected throw could permanently strand the "uploading…" spinner.
**Fix:** Removed the `listPhotographerFilesFromStorage` call from the upload success path.
Simplified the Storage-listing `useEffect` to just flip `loadingStorage = false` immediately
(no more cache clearing). Wrapped the upload block in `try/finally` so `setUploading(false)`
always runs.

---

### BUG-R006 — CSP blocks API calls → endless loading on return visit (Resolved 2026-05)

**Files:** `firebase.json`, `src/utils/poller.js`, `src/services/auth.js`
**Severity:** Critical — returning users see infinite spinner, no error message
**Symptom:** Console showed:
```
Refused to connect to https://api-je74slt7ra-uc.a.run.app … Content Security Policy
[dawa] apiClient.fetch GET /auth/me TypeError: Failed to fetch
[dawa] poller.tick Error network_error
```
**Root cause:** `VITE_API_BASE_URL` points to Cloud Run domain `api-je74slt7ra-uc.a.run.app`,
which was not in `connect-src`. `poller.tick` swallowed network errors without calling its
callback, so `authReady` was never set to `true` and `AuthLoadingScreen` hung forever.
**Fix:** Added `https://api-je74slt7ra-uc.a.run.app` to `connect-src` in `firebase.json`.
Added `onError` option to `createPoller`; `subscribeAuth` passes `onError: () => cb(null)`
so the first network failure resolves to the login screen instead of hanging.
**Deploy required:** `firebase deploy --only hosting --project dawa-aa793`

---

### BUG-R007 — Groom proof photos not visible (Resolved 2026-05)

**Files:** `src/hooks/usePortalState.js` (proof URL resolution), `firebase.json` (CSP)
**Severity:** High — groom cannot verify driver deliveries
**Symptom:** Groom portal shows emoji placeholder instead of proof images.
**Root cause:** `proofDownloadUrl()` called `api.get("/proofs/url?path=…")` through the same
CSP-blocked domain. The error was caught silently and stored as `null` in `proofUrlCache`,
preventing retries. `GroomProofs.jsx` only renders `<img>` for `https://` URLs.
**Fix:** CSP fix (BUG-R006) allows the `/proofs/url` call to succeed. Catch block now logs
the error via `logErr` and skips caching `null`, so failed fetches retry on next render.

---

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
