# REST API Smoke Test Guide

End-to-end verification of the Firebase → REST migration. Run these checks in order; each builds on the previous one.

---

## A. Automated tests (already passing)

```bash
npm run test:unit
```

Expected: **403 tests across 14 files passing** in <10s. Covers:
- `tokenManager` (20) — login/refresh/expiry/coalescing/clear
- `apiClient` (24) — headers, verbs, 401 retry, ApiError
- `poller` (11) — interval, unsubscribe, error swallowing, 401 stop
- `services/*` (85) — every service file maps to the right REST endpoint
- `stripApiPrefix` (6) — Express middleware handles both hosting + direct URLs
- existing utils/data/functions tests (257)

If any fail: **stop**. Fix before continuing.

---

## B. Backend build

```bash
cd functions && npm run build && cd ..
```

Expected: clean TypeScript compile, no warnings.

## C. Frontend build

```bash
npm run build
```

Expected: clean Vite build, ~664 KB main bundle. **No `firebase/*` import errors.**

---

## D. Local emulator smoke test

**Prerequisite:** Java 11+ installed and on `PATH`. The current shell shows Java 8 — install OpenJDK 21 from `https://adoptium.net/` before continuing. (The Firestore + Auth emulators won't start on Java 8.)

### D.1 Start emulators

```bash
npm run emulators:build
```

This builds Cloud Functions and starts the auth/database/firestore/storage/functions/hosting emulators on the standard ports. The Emulator UI opens at `http://localhost:4000`.

Keep this terminal running.

### D.2 Seed test users in a second terminal

```bash
npm run emulators:seed
```

Expected output:
```
[seed] created: admin (...)
[seed] created: groom (...)
[seed] created: driver (...)
[seed] guest: Ahmad Test -> ...
[seed] guest: Fatima Test -> ...
[seed] assigned driver ... -> groom ...
[seed] done.

Login via /api/auth/login:
  admin / Admin1234
  groom / Groom1234
  driver / Driver1234
```

### D.3 Start Vite pointing at the local API

In a third terminal:

```bash
npm run dev:emulator
```

Opens at `http://localhost:5173`. The Vite env points `VITE_API_BASE_URL` at the local function URL.

### D.4 Critical-path checklist

Walk through each in the browser. ✅ if it works, ❌ if it fails — fix before continuing to the next.

| # | Flow | How | Pass criteria |
|---|------|-----|---------------|
| 1 | Admin login | `/portal` → admin / Admin1234 | LocalStorage has `dawa.idToken`. Admin user manager loads. |
| 2 | Token refresh | DevTools → Application → Local Storage → set `dawa.expiresAt` to past timestamp → trigger any API call | Network tab shows `POST /api/auth/refresh` → 200, then the original call retries and succeeds |
| 3 | Groom adds guest | Logout, login as groom / Groom1234, add a guest | Guest appears in admin's confirmation tab within 15s |
| 4 | Public confirm form | Open `http://localhost:5173/confirm/groom` in incognito; submit name+phone+city | Lands in `/portal/admin/confirmations` |
| 5 | Driver self-assign + upload | Login driver / Driver1234, pick groom, mark a guest delivered with photo | Proof appears in groom's proofs gallery; check Storage emulator UI |
| 6 | SSE live locations | Open groom's live map; with driver logged in on another browser, start sharing | Pin appears within 2-3s; DevTools shows `EventSource` open on `/api/live-locations/.../stream?token=...` |
| 7 | Digital invite RSVP | Login as groom; create a digital guest; copy invite link; open in incognito; submit RSVP | Guest status flips on groom dashboard |
| 8 | Password OTP reset | Skip unless `VITE_RECAPTCHA_V2_SITE_KEY` is set. Otherwise: open login screen, click "Forgot password" | reCAPTCHA renders; SMS arrives at emulator log; password actually changes |

---

## E. Production smoke test

**Prereq for E.1:** Functions deploy must be unblocked. Last attempt failed with:
> Cloud Billing API has not been used in project 299218076445

To unblock, either:
- **Option A (recommended)**: Run `npx firebase login` interactively in your own terminal. Once authenticated as the project owner, `npx firebase deploy --only functions:api --project dawa-aa793` will work.
- **Option B**: Grant the service-account these IAM roles in GCP Console → IAM:
  - Cloud Functions Admin (`roles/cloudfunctions.admin`)
  - Cloud Build Editor (`roles/cloudbuild.builds.editor`)
  - Artifact Registry Administrator (`roles/artifactregistry.admin`)
  - Service Account User (`roles/iam.serviceAccountUser`)
  - Cloud Billing User (`roles/billing.user`)

### E.1 Deploy the path-strip fix

A critical bug was found locally — **the deployed API currently returns `{error:"not_found"}` for every endpoint** because Express receives the full `/api/...` path but routers are mounted at `/auth`, `/users`, etc. The fix (in `functions/src/api/index.ts`) strips the `/api` prefix before routing. It is committed locally but not deployed.

Verify the bug exists:
```bash
curl -s -X POST https://dawa-aa793.web.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"x","password":"y"}'
```
Expected (currently): `{"error":"not_found","path":"/api/auth/login"}`
After fix: `{"error":"invalid_credentials"}` (or similar — the bug is gone, but the test creds are wrong).

Deploy:
```bash
npx firebase deploy --only functions:api --project dawa-aa793
```

### E.2 Re-test critical paths against production

Repeat the 8 checks from D.4 against `https://dawa-aa793.web.app`. Login as a real seeded admin/groom/driver.

### E.3 Confirm no Firebase SDK leaks

```bash
grep -r "from \"firebase/" src/
```
Expected: no matches.

```bash
grep -ro "firebase" dist/ | sort -u
```
Expected: only `firebasestorage.googleapis.com` / `storage.googleapis.com` URLs (Storage download URLs still use these hosts).

---

## G. Real-device matrix (mobile-first — do before every prod deploy)

Playwright now runs the suite across Chromium/Firefox/WebKit + emulated Pixel 7
& iPhone 14 (`npx playwright test`). Emulation catches layout/CSS/RTL
regressions but **cannot** test the camera, Face-Liveness, or GPS, and emulated
Safari ≠ real iOS Safari. So before each prod deploy, run this short pass on
**≥1 real iPhone + ≥1 real Android** (your own devices are enough — no paid lab).

Keep it under ~10 minutes. ✅/❌ each; fix before deploying.

| # | Flow | Watch specifically for (mobile/RTL) |
|---|------|-------------------------------------|
| 1 | Landing page | RTL layout intact; CTA tappable; no horizontal scroll; fonts render AR + HE |
| 2 | Login per role (admin/groom/driver) | Keyboard doesn't cover inputs; submit reachable; redirect correct |
| 3 | Groom adds a guest | PhoneInput accepts Arabic digits; city picker usable one-handed |
| 4 | Public RSVP `/confirm/:groom` | Form submits in WhatsApp's in-app browser (open the link FROM WhatsApp) |
| 5 | Digital invite open `/d/:groom/:token` | Renders in WhatsApp in-app browser; OG preview shows; no clipped RTL text |
| 6 | Driver: photo upload + GPS share | Native camera opens; upload completes on cellular; live pin appears |
| 7 | Face-finder: camera + Face-Liveness | Front camera + Liveness challenge run on **real** hardware (iOS + Android) |

> The WhatsApp in-app browser (rows 4–5) is where guests actually open links and
> is the single highest-value real-device check — emulation can't reproduce it.

---

## F. Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Every API call returns `not_found` | Path-strip fix not deployed | `npx firebase deploy --only functions:api` |
| `POST /api/auth/login` returns CORS error | `ALLOWED_ORIGINS` in `functions/.env` excludes the requesting origin | Add the origin or leave empty for dev |
| `EventSource` immediately closes | `?token=` invalid/expired | Check tokenManager localStorage; force-refresh via /auth/refresh |
| 401 loop on every request | Refresh token expired/revoked | Login again; the loop is bounded — second 401 clears tokens |
| Proof upload returns 413 | File >6MB | Resize on the client |
| Photographer delete returns 404 | (Fixed locally) `removePhotographerFileByPath` was dead code | Already removed |
