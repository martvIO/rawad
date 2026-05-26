# Known Bugs — Dawa

_Track open bugs here. Mark resolved bugs with the fix date. Never delete entries — move them to a "Resolved" section._

---

## Open Bugs

### BUG-O004 — Both invitation links untested and likely broken

**Files:** `src/pages/InviteForm.jsx`, `src/pages/DigitalInviteForm.jsx` (routes `/invite/:token`, `/invite/digital/:token`)
**Severity:** Unknown — neither link has been tested end-to-end; assumed broken until verified
**Symptom:** Unconfirmed — invitation links sent to guests via WhatsApp have not been exercised in any test run.
**Root cause:** Not yet investigated.
**Status:** Needs a Playwright smoke-test covering the full flow: generate link → open in browser → confirm guest details render correctly → submit form.

---

## Resolved Bugs

### BUG-O003 — Not all uploaded files are visible in the gallery (Resolved 2026-05-26)

**Files:** `functions/src/api/routes/digital.ts`
**Severity:** Medium — partial gallery; users could not manage their full upload history
**Symptom:** After uploading multiple files in one batch, only a subset (often just the last one) showed up in the gallery after the next poll refresh. No error indicator surfaced.
**Root cause:** Classic read-modify-write race on the `media[]` array. The dashboard's `handleAddMedia` fans uploads out via `Promise.allSettled`, hitting `POST /api/digital/:uid/media/upload` in parallel. The handler did `docSnap = docRef.get()` → splice → `docRef.set({ media: [...] })` as three separate steps, so N concurrent requests each saw the same `existing` array and wrote `[existing, file_i]` back. Whichever write committed last won; every earlier file was silently overwritten in Firestore. The same race lived in the media-delete and mockup-upload handlers.
**Fix:** Wrapped each read-modify-write in `fs().runTransaction(...)`. Firestore serializes the read+set per document, so concurrent uploads each see prior commits and append safely. Applied to:
- `POST /api/digital/:uid/media/upload`
- `POST /api/digital/:uid/media/delete-item`
- `POST /api/digital/:uid/design-requests/:reqId/mockup`

**Verified:** Playwright drove the deployed `dawa-aa793.web.app` site, uploaded 3 PNGs simultaneously, then read `/api/digital/:uid/media` directly: all 3 storage paths persisted (timestamps within 89 ms of each other — exactly the window that previously caused clobbers). UI count moved 10→13 and stayed there across reloads.

---

### BUG-O002 — Uploaded files never appear in the gallery despite successful upload toast (Resolved 2026-05-26)

**Files:** `src/hooks/usePortalState.js`, `src/services/digitalInvitation.js`, `src/pages/portal/groom/digital/DigitalDashboard.jsx`, `src/pages/portal/groom/digital/DigitalPhotographer.jsx`
**Severity:** High — uploads showed a success toast but the file would vanish from the gallery on the next poll tick and never come back without a hard refresh
**Symptom:** User uploaded a file, saw the success toast, the file showed briefly in the gallery, and then disappeared. Refreshing sometimes brought it back, sometimes didn't.
**Root cause:** TWO compounding bugs surfaced together:
1. **Primary (subscription never started).** `usePortalState.js` declared `currentUid` on line 85 but never included it in its return object. The dashboard / photographer pages destructured it via `const { currentUid } = usePortal()`, got `undefined`, and the `useEffect` that subscribes to `subscribeDigitalMedia` / `subscribePhotographerFiles` early-bailed every render via `if (!currentUid) return`. The poll never ran, so `setDoc(serverResult)` never fired and the page rendered an empty doc on every fresh load. Uploads themselves still worked because `handleAddMedia` has a `currentUid || getStoredUid()` fallback — the optimistic `setDoc(prev => ...)` populated the UI for the session, but a reload showed zero items because nothing was reading the server. This was a latent issue that BUG-R012's optimistic update partially masked.
2. **Secondary (poll vs optimistic race).** Even once the subscription works, the 15-second poller called `setDoc(serverResult)` unconditionally — blindly replacing local state. A poll already in flight when the upload commits will land its stale (pre-upload) snapshot AFTER the optimistic merge and wipe the freshly uploaded entry. Up to one more poll cycle later it self-heals, but in the gap the file appears to vanish.
**Fix:**
1. `usePortalState.js` now includes `currentUid` in its return object next to `currentUsername` — the foundational fix without which the rest of the optimistic logic is invisible.
2. Both subscriptions accept an optional `transform(serverResult) => result` callback that runs against every poll result before the consumer sees it.
3. The dashboard and photographer page track recently-confirmed uploads in a `pendingPathsRef` / `pendingFilesRef` map (keyed by `storagePath` / file `id`). The `transform` callback splices any entries the poll result is missing back into the result, and removes entries the server has now echoed.
4. Optimistic deletes also clear from the pending map so a poll mid-delete can't resurrect a just-deleted entry via the same merge path.
5. The photographer upload service now returns the full record (`{ id, url, storagePath, name, type, uploadedAt, key }`) instead of just `{ url, key }`, so the page can register a complete pending entry without a second round trip.
**Verified:** Playwright drove the deployed `dawa-aa793.web.app` site: gallery rendered the existing 10 media items + the seven-rank-plus-wedding-date settings (was 0 before the `currentUid` fix); a 3-file parallel upload landed all 3 in Firestore (10→13, was losing all but one with the read-modify-write race); a single upload survived 35s / multiple poll cycles without vanishing. Photographer page tested with a 2-file parallel upload (8→10, stable).

---

### BUG-R012 — Digital dashboard: stale UI after media upload, date change, and rank edits (Resolved 2026-05-26)

**Files:** `src/pages/portal/groom/digital/DigitalDashboard.jsx`, `functions/src/api/routes/digital.ts`, `functions/src/api/routes/proofs.ts`
**Severity:** High — three separate flows on the groom digital dashboard appeared broken because UI changes only surfaced after the next 15-second poller tick. Slow uploads compounded the misperception.
**Symptom:** (1) Photo uploaded but didn't appear in the gallery for up to 15s; (2) wedding-date input snapped back to the prior value after the user picked a new date; (3) newly added/removed guest ranks didn't show up. Also: all uploads (including driver proof photos) lacked GCS resumable semantics and could fail in full on flaky networks.
**Root cause:** The dashboard reads `doc` state exclusively from `subscribeDigitalMedia()` (a 15-second poller). Each mutation handler (`handleAddMedia`, `handleDateChange`, `handleAddRank`, `handleRemoveRank`, `handleRemoveMedia`) PATCHed the server doc but never updated local state, so users had to wait up to 15s before the change was visible — a classic "missing optimistic update" pattern. Separately, `uploadAndGetUrl()` and the proofs upload handler called `file.save(buffer, { resumable: false })`, which means any transient network failure restarted the entire upload from byte 0 instead of retrying just the failed chunk.
**Fix:**
1. Each dashboard handler now mirrors its server write into `setDoc(prev => ...)` *after* the API resolves successfully. On failure we deliberately skip the local update so the UI reflects the actual persisted state.
2. A docblock at the top of `DigitalDashboard.jsx` codifies the optimistic-mutation convention so future contributors don't repeat this class of bug.
3. `uploadAndGetUrl()` and the proofs upload both switch to `resumable: true`, giving the GCS client chunked uploads with per-chunk retry — a reliability win for the 200 MB photographer files and field-uploaded driver proofs.
4. Bonus defensive checks: malformed/empty upload responses are filtered before merging into `media[]`; deduplication by `storagePath` prevents double-render if the poller fires mid-upload; client-side rank-length and rank-count limits mirror the server's so optimistic state can't diverge from what actually persists; partial-batch upload failures now surface a "(n/total)" suffix in the toast.

---

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
