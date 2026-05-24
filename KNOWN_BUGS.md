# Known Bugs — Dawa

_Track open bugs here. Mark resolved bugs with the fix date. Never delete entries — move them to a "Resolved" section._

---

## Open Bugs

_None._

---

## Resolved Bugs

### BUG-R011 — `POST /api/.../upload` returns 400 `api_invalid_multipart` (Resolved 2026-05-25)

**Files:** `functions/src/api/routes/digital.ts`, `functions/src/api/routes/proofs.ts`
**Severity:** High — every multipart endpoint (digital media, photographer files, design
mockups, delivery proofs) was broken; affected groom uploads of invitation backgrounds,
photographer files, and driver proof photos.
**Root cause:** Firebase Functions v2 `onRequest` pre-consumes the request body and exposes
the raw bytes via `req.rawBody`. The `parseMultipart` helpers in both files did
`req.pipe(bb)`, which had nothing to pipe — busboy emitted an "Unexpected end of form"
error that the handler surfaced as `{ error: "invalid_multipart" }`.
**Fix:** Updated both `parseMultipart` implementations to feed busboy from `req.rawBody`
when present (`bb.end(rawBody)`) and fall back to `req.pipe(bb)` only when the buffered
body is absent (tests / local dev with a non-buffered transport).

---

### BUG-R010 — `GET /api/proofs/url` returns 500 → proof photos fail to load (Resolved 2026-05-25)

**Files:** `functions/src/api/routes/proofs.ts`, `functions/src/api/routes/digital.ts`,
`functions/src/constants/time.ts`
**Severity:** High — groom/admin could not view proof photos; poller retried on every
tick, flooding the console.
**Root cause:** `bucket.file(path).getSignedUrl({ action: "read", ... })` requires the
function's service account to hold the **Service Account Token Creator** IAM role on
itself so it can self-sign URLs. The default Firebase deploy does not grant that role,
so `getSignedUrl` threw, and the handler returned `{ error: "url_failed" }` as a 500.
The same call inside `digital.ts/uploadAndGetUrl` had the same latent failure mode —
it was masked by BUG-R011 because uploads never reached the signing step.
**Fix:** Switched both routes to `getDownloadURL(file)` from `firebase-admin/storage`.
That helper embeds a Firebase download token in the URL and uses Firebase's internal
APIs (no `signBlob` permission required), so it works on a default deploy. As a bonus,
`getDownloadURL` URLs do not expire on a timer like signed URLs did — fixes the latent
issue where stored 30-day `MEDIA_DOWNLOAD_URL_TTL_MS` URLs in Firestore would have
broken after expiry. Removed the now-unused `PROOF_DOWNLOAD_URL_TTL_MS` and
`MEDIA_DOWNLOAD_URL_TTL_MS` constants.

---

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
