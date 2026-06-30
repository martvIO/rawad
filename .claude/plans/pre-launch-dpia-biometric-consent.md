# Pre-Public-Launch Readiness — Soft Launch of دعوة (Dawa)

## Context

We want to put the platform in front of real users for the first time. This is **not** a wide-open public launch — it's a **controlled soft launch**: you personally onboard **1–5 real grooms** (manual account creation, no in-app payment), run real weddings through it, and can pull back fast. The bar is "safe and legally defensible for a small known cohort," not "withstand the open internet."

Three scout passes + a design pass established the starting state:
- **Secrets are clean in git** — `backend/functions/.env` is gitignored (`.gitignore:7`), never committed; the live AWS keys and password-encryption key are **not** in any git history (verified with `git log -S`). The only real exposure is that they live in plaintext on the local disk and must also exist in Secret Manager for prod.
- **Security posture is strong** — RTDB/Firestore/Storage rules are fail-closed, role-based, schema-validated; `assertAdmin()` guards every privileged endpoint; ~646 test files; CI runs gitleaks/semgrep/codeql.
- **The 3D-envelope enhancement is complete and unit-tested but uncommitted** (7 files, ~358 lines, 2 new test files, no TODOs/console.logs).
- **Face-matching is live with AWS Rekognition** and auto-indexes everyone in photographer photos — the biggest legal surface, and the reason for the consent work below.

### Launch decisions (locked via grilling)

| Decision | Choice |
|---|---|
| Launch posture | **Controlled soft launch** (invite-only, you onboard grooms) |
| Payments | **Off** — manual onboarding, Lemon Squeezy stays unconfigured |
| 3D-envelope work | **Ship it**, but browser-test first |
| Monitoring | **Sentry on** in prod |
| Test gate | **Full** (unit + api + e2e + Playwright smoke) |
| Prod secrets | **Verify in Secret Manager** before deploy |
| Captcha on public forms | **Deferred** until access widens |
| Data/privacy | **Minimal privacy notice** + **Full DPIA-grade biometric consent** |

---

## Part 1 — Ship the 3D-envelope enhancement (test-gated)

The work is done; it just has to be verified in a real browser before it deploys (per CLAUDE.md end-of-session rule).

1. `npm run dev:emulator`, then drive via **Playwright MCP**:
   - **Groom editor** ([DigitalDesignEditor.jsx](frontend/src/pages/portal/groom/digital/DigitalDesignEditor.jsx)): edit the 5 envelope colors, toggle stars, move density/intensity sliders, confirm the live 3D preview updates and the PATCH persists.
   - **Guest render** (`/d/:groomUsername/:token`): confirm the sealed envelope opens and renders with the groom's overrides; confirm graceful fallback under reduced-motion / low-end.
2. Fix → rebuild → retest until green.
3. Commit the 7 modified files + 2 new test files (do **not** `git add -A` — the admin-SDK key sits in the repo root).

Touched files (already on disk): `backend/functions/src/api/routes/digital/{constants,sanitize}.ts`, `frontend/src/components/digital/{DigitalInvitationView.jsx,celestial/envelopeMesh.js,sections/CelestialAmbience.jsx}`, `frontend/src/pages/portal/groom/digital/DigitalDesignEditor.jsx`, `frontend/src/utils/themeToEnvelopePalette.js`, + the two `*.test.*` files.

---

## Part 2 — Full DPIA-grade biometric consent flow (the main new build)

Face-matching has two indexing streams: **enrolled guests** (selfie search — already has disclosure + `consentAt`, just no affirmative checkbox) and **passive subjects** (everyone auto-indexed in photographer photos via [trigger.ts](backend/functions/src/faceIndex/trigger.ts) — zero consent). Retention is already compliant (30-day purge, manual erase, guest self-delete). The build adds affirmative consent for active users and a notice-plus-opt-out regime for passive subjects, gated by a per-wedding indexing flag.

### MUST-HAVE before launch

**Gate the auto-indexing (the legal basis for indexing passive subjects)**
- Add `indexingConsentGate: boolean` to the parent doc `digitalInvitations/{uid}`; store the photographer ack in the server-only `galleryConfig/config` subdoc (avoid exposing it on the public-read parent).
- In [trigger.ts](backend/functions/src/faceIndex/trigger.ts) **after line 72, before line 74**: if the gate is off, write a `deferred_no_consent` status row and return with **no AWS call**. When the gate flips on at publish, the existing `touchUnindexedPhotographerFiles` backfill ([media.routes.ts:177](backend/functions/src/api/routes/digital/media.routes.ts)) re-fires the trigger → indexing → `clusterDirty` → scheduled recluster. Clustering flow is preserved; only its start moment moves from upload to publish+ack.

**Photographer acknowledgment on publish**
- In [media.routes.ts](backend/functions/src/api/routes/digital/media.routes.ts) publish-flip block (lines 166–172): require `photographerAck === true`, else `409`; on success set `indexingConsentGate: true` and persist the ack. Ensure the ack gate sits **before** the WhatsApp "photos ready" send (`media.routes.ts:189`). Add the `photographerAck` boolean to `sanitizeMediaSettings` ([sanitize.ts:266](backend/functions/src/api/routes/digital/sanitize.ts)).
- Frontend confirm-modal in `togglePublish` ([DigitalPhotographer.jsx:145-159](frontend/src/pages/portal/groom/digital/DigitalPhotographer.jsx)) — reuse existing modal CSS; only publish after the ack checkbox is confirmed.

**Affirmative consent — selfie search (enrolled guests)**
- Require `consent: true` on POST `/enroll` ([photoFaces.ts:106-121](backend/functions/src/api/routes/photoFaces.ts)); reject `400 consent_required` if absent. Store a `consent: {biometric, version, at, source, locale}` block in the `guestFaces` doc (extend the `.set` at lines 167-176; `guestFaces` is already server-only — no rule change).
- Add a required checkbox to the `stage === "consent"` block ([DigitalYourPhotos.jsx:206-266](frontend/src/pages/DigitalYourPhotos.jsx)); disclosure text already exists. Plumb `consent` through `enrollWithLiveness` (shared service `shared/src/services/digitalPhotos.js`).

**Affirmative consent — People gallery entry**
- Require `consent === true` on POST verify-otp ([galleryAccess.routes.ts:127-165](backend/functions/src/api/routes/digital/galleryAccess.routes.ts)); record it in the `galleryGrants` set (line 156).
- Add disclosure + required checkbox to the gate card ([PeopleGallery.jsx:165-184](frontend/src/pages/PeopleGallery.jsx)); embed the existing `ConsentNotice` link to `/terms`.

**Notice content + DPIA doc**
- Add a dedicated biometric section to `terms_privacy_sections` in `shared/src/i18n/ar.js` (~line 704) and the Hebrew parallel in `shared/src/i18n/he.js` (write to the **shared** package, not the frontend stub): what's collected (a numeric face signature, not the photo), legal basis (consent + Israeli Privacy Protection Law 1981), processor (AWS Rekognition + region), 30-day retention, and rights (delete-anytime + opt-out for non-guests). Add compact in-flow keys for the three gates.
- Write `docs/DPIA-biometric.md`: system description & data flows, data categories (special-category biometric templates, phone numbers, tokens), lawful basis, necessity/proportionality, retention & deletion, risks & mitigations, residual-risk sign-off scoped explicitly to "soft launch, 1–5 weddings."

### FAST-FOLLOW (ship within the first week; admin manual-erase is the interim backstop)

**Passive-subject opt-out** ("remove me from these photos" — the only self-service remedy for people who only appear in photos)
- New endpoints under `/digital/gallery/:groomUsername/optout/*` (username-scoped — passive subjects have **no token**): start a liveness session, then match the requester's selfie against the collection with `rekognition.searchByImage()` ([rekognition.ts:174](backend/functions/src/faceIndex/rekognition.ts)) at a **high** threshold (≥90), delete matched `faceId`s via `deleteFaces()` (rekognition.ts:222), prune them from `photoFaces` rows + `peopleClusters` members, persist a `faceOptOuts` record, set `clusterDirty`.
- New page `RemoveMyFace.jsx` at `/g/:groomUsername/remove-me`, reusing the lazy `LivenessCapture` flow from `DigitalYourPhotos.jsx`.
- Add `match /faceOptOuts/{id} { allow read, write: if false; }` to `firestore.rules`.
- Robustness: persist a suppression list and have the trigger re-delete a returning face after re-index.

---

## Part 3 — Minimal privacy notice + ops hardening

- **Minimal privacy notice** (separate from the biometric DPIA): a short privacy page (names, phone numbers, proof photos — why, retention, contact) surfaced via the existing `ConsentNotice` link on the public `/confirm` and `/invite` forms. Reuse `TermsPage` + `terms_privacy_sections`.
- **Turn on Sentry**: provision `SENTRY_DSN` as a Functions secret; confirm `GET /api/health` reports `monitoring: true`. (Already wired with PII scrubbing — just the env var.)
- **Verify prod secrets in Secret Manager** (hard gate — app breaks without them): `WEB_API_KEY`, `ALLOWED_ORIGINS` (must match final prod domains: dawa.to / invite.dawa.to / firebase domains), `PASSWORD_ENC_PRIVATE_KEY` (else `/health` shows `encryption:false`), AWS keys (face feature is on).
- **Hide the self-signup/pay path**: since payments are off, ensure no public visitor can reach the `/pay` flow and hit a raw 503 — confirm it's invite-only or the entry points are removed for v1.
- **Optional hardening** (not a launch blocker): move the on-disk admin-SDK key + AWS keys off the laptop into Secret Manager; consider rotating the AWS keys as cheap insurance (they were read into agent contexts this session, though never git-leaked).

---

## Part 4 — Pre-deploy test gate & deploy

1. `npm run test:unit` (fast) → `npm run test:api` (emulator) — both green.
2. New tests (reuse existing vitest DI-fake + Playwright harnesses):
   - Backend: trigger-gate (off → `deferred_no_consent`, no AWS call; on → indexes), enroll-consent (400 without consent), gallery verify-otp consent, photographer-ack (409 without ack, no flip/backfill). *(May need a tiny refactor of `trigger.ts` to expose a testable core, mirroring `purgeWeddingFacesWith`.)*
   - Frontend: the three consent gates disable their action until checked.
   - E2E: `biometric-consent.spec.ts` for selfie + gallery gates; extend `rtl.spec.ts` for AR/HE.
3. Stage **specific** files, conventional commits, `git push origin main` (never `git add -A`).
4. Deploy: `firebase deploy --project dawa-aa793` (or by target to limit blast radius). The `SessionEnd` hook also auto-deploys — don't double-deploy.

---

## Verification (end-to-end, post-deploy smoke)

Via Playwright MCP against the hosted URL, walking the critical paths the change touches:
- Login per role (admin / groom / driver) → correct portal.
- Groom: envelope editor saves; guest `/d/:groomUsername/:token` renders the envelope.
- Selfie search (`/d/.../photos`): consent checkbox blocks the camera until checked; enroll stamps consent.
- People gallery (`/g/:groomUsername`): consent gate shows disclosure + blocks OTP until checked.
- Photographer publish: ack modal blocks publish until confirmed; before ack, nothing is indexed (verify a `deferred_no_consent` status); after ack, indexing + clustering run.
- `GET /api/health` → `monitoring: true`, `encryption: true`.
- Confirm + invite public forms render with the privacy notice link.
- `firebase functions:log` clean of unhandled errors / unexpected `permission-denied`.

---

## Decisions to confirm during implementation (Ask-First items)

1. **Index timing**: gating defers indexing to publish, so the first guest may hit a brief "still processing" window. Accept for 1–5 weddings, or pre-index into a quarantined-until-ack state? (Recommend: accept + show a processing state.)
2. **Opt-out semantics**: suppress the biometric identifier only (photo stays, others appear in it) vs. redact the photo. (Recommend: suppress identifier only.)
3. **Opt-out match threshold**: 90 similarity + single-cluster confirmation to prevent one person deleting another's faces.
4. **Opt-out identity proof**: liveness selfie under `/g/:groomUsername` (no token) — confirm acceptable.

These touch the database and feature behavior — per CLAUDE.md, confirm each before implementing that piece.

---

## Housekeeping

- File the launch decisions into the wiki at grilling conclusion: posture + payments-off + DPIA-grade consent → `wiki/Architecture-Decisions.md` (or a new `wiki/Biometric-Consent.md`), cross-linked; update `wiki/index.md`; append the single `log.md` session line at session end.
