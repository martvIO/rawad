---
date: 2026-06-15
sources:
  - session 2026-06-12 (server-side face index build, face-api)
  - session 2026-06-15 (AWS Rekognition rebuild + People gallery)
tags: [digital, biometric, faces, rekognition, aws, firestore, functions, concept]
---

# Face Matching

Two guest-facing features on the public digital invitation, both on one shared
**AWS Rekognition** face index. Part of [[Digital Invitations]].

1. **"صورك / your photos"** (`/d/:groomUsername/:token/photos`, `frontend/src/pages/DigitalYourPhotos.jsx`) — a guest enrols a selfie once and gets every published photographer photo they appear in, with a **download-all ZIP**.
2. **"ألبوم الأشخاص / People gallery"** (`/g/:groomUsername`, `frontend/src/pages/PeopleGallery.jsx`) — a shareable, **OTP + guest-list gated** album that groups every face into person-tiles (iPhone Photos → People style); tap a person → their photos + ZIP. Look **inherits the invitation theme**; admin approves + can kill-switch it.

## Engine — AWS Rekognition (2026-06-15 rebuild)

Replaced the self-hosted `@vladmandic/face-api` / tfjs-WASM engine with AWS
Rekognition, behind a config seam (`backend/functions/src/faceIndex/`):

- **`config.ts`** — `isRekognitionConfigured()` (true when `AWS_ACCESS_KEY_ID/SECRET/REGION` are set) decides the active engine. Without creds, the trigger falls back to the legacy face-api path (no dev regression). `activeIndexVersion()` stamps each row so a first cred-add re-indexes everything.
- **`rekognition.ts`** — the only AWS seam: one **Collection per wedding** (`dawa_{groomUid}`), `IndexFaces` (photo faces tagged `ExternalImageId="photo:{fileId}"`, guest selfies `"guest:{guestId}"`), `SearchFacesByImage` / `SearchFaces`, `DeleteFaces` / `DeleteCollection`, **Face Liveness** session helpers, and ≤5 MB image downscale. Bounding boxes come back natively normalized 0–1 (free person-tile crops).
- **`match.ts`** (pure) — ExternalImageId encode/decode + `joinRekognitionMatches` (search hits → photo metadata, deduped, sorted by similarity).
- **`cluster.ts`** (pure) — union-find over the `SearchFaces` similarity graph → person clusters. `CLUSTER_MIN_SIMILARITY = 90`.
- **`clusterJob.ts`** — `recomputeClusters(uid)` builds `peopleClusters/{id}`; `reclusterDirtyGalleries` (onSchedule) auto-reclusters grooms whose upload burst settled (`clusterDirty` + 3-min quiet period). Manual curation is preserved across recompute by keying overrides on stable FaceIds.
- **`purge.ts`** — `purgeExpiredFaces` (onSchedule, daily) deletes the AWS collection + Firestore face data ~30 days after the wedding (the consent-screen promise); admin "erase now" route too.

The indexing trigger (`trigger.ts`) downloads the Storage object → downscale → `IndexFaces` → writes `photoFaces/{fileId} = {faces:[{faceId, box, confidence}], faceCount, provider:"rekognition", collectionId, status}`.

## Threshold calibration (measured, not guessed)

`scripts/rek-diagnose.cjs` on real group photos: same-person face pairs score
**95–100**, different people **< ~85**, with a near-empty **85–95 gap**. So
match threshold **90** (personal) and cluster threshold **90** sit cleanly in the
gap. The `facerec_examples` fixtures are graduation GROUP photos (~22 attendees
across 16 shots) — clustering correctly finds ~20+ people, not 2.

## Data model

- **AWS:** face vectors live in the per-wedding Rekognition Collection (NOT Firebase — the one deviation from "all data in Firebase", accepted for accuracy/scale).
- **Firestore (server-only, `if false`):** `photoFaces/{fileId}` (faceIds + boxes), `guestFaces/{sha256(token)}` (enrolled FaceId + phone + `expireAt` TTL), `peopleClusters/{id}` (rep + members + label/hidden/linkedPhone/manual), `galleryConfig/config` (approval state machine + `enabled` kill-switch + cover/title/layout), `jobStatus/clustering` (progress).
- **RTDB (server-only):** `galleryGrants/{groomUid}/{tokenHash}` — 24h gallery-access grants.

## Flows

- **Personal** (`photoFaces.ts`): `POST /digital/photos/liveness/session` → AWS Face Liveness; `POST /enroll` (multipart selfie upload OR `livenessSessionId`) → IndexFaces guest → SearchFaces → matches; `GET /matches`; `DELETE /enroll` (DeleteFaces + erase); `GET /zip` (archiver stream from Storage). Frontend (`DigitalYourPhotos.jsx`): **camera Liveness only** as of 2026-06-19 — see below; the backend `/enroll` multipart branch is retained but the guest UI no longer offers upload. Phone capture via the shared `PhoneInput` (Arabic-digit-safe); download-all ZIP.
- **Gallery** (`gallery.routes.ts` authed + `galleryAccess.routes.ts` public): groom/admin recompute + curate (hide/rename/merge) + approve + kill-switch (admin console = `AdminGallery.jsx`); public viewer enters phone → must be in the guest list → SMS code (reuses Firebase Identity Toolkit OTP) → 24h grant → themed person-tiles → person photos + ZIP. WhatsApp template bulk-send (`photoShare.routes.ts`) reuses each guest's existing token.

## Privacy / security

- Biometric collections are server-only; the selfie is uploaded + processed by AWS (consent copy updated to say so) and only a FaceId is kept.
- People gallery is **never public** — phone-OTP + guest-list membership + a per-wedding admin kill-switch (`enabled`, default off) + admin approval (`galleryStatus`).
- Auto-purge ~30 days post-wedding; guest opt-out erases their face immediately.

## Camera-only enrollment + auto-send on publish (2026-06-19)

- **Camera-only "your photos"** — `DigitalYourPhotos.jsx` no longer shows the "upload a photo" button; AWS Face Liveness is the **only** enrollment path (anti-spoofing; per product decision "truly camera-only, no fallback"). The camera button is gated on a complete phone (`isCompletePhone`). When `livenessConfigured()` is false the page shows a graceful "this needs a camera — open on a supported phone" notice instead of the camera (so a pre-Cognito deploy degrades, it doesn't break).
- **Why the camera button was invisible in prod — RESOLVED 2026-06-19.** `livenessConfigured()` needs `VITE_COGNITO_IDENTITY_POOL_ID` + `VITE_AWS_REGION` in the frontend env, and **neither was set** in `frontend/.env`. The Cognito pool actually **already existed** from the 2026-06-15 setup (name `dawa_face_liveness`, ID `us-east-1:f2e0f5cc-6027-4859-94d5-3b9cdab221da`, guest access active, role `dawa-cognito-unauth` w/ `DawaFaceLiveness` policy → `rekognition:StartFaceLivenessSession`) — it was just **never wired into the frontend**. Fixed by adding `VITE_AWS_REGION=us-east-1` + the pool ID to `frontend/.env` (gitignored, lives on the deploy machine; also recorded in `docs/AWS_REKOGNITION_SETUP.md`). Verified the pool ID lands in the built `LivenessCapture` bundle. Region is **`us-east-1`** (matches backend `AWS_REGION`), NOT the doc's old `eu-west-1` placeholder. **Ships via a hosting deploy** (frontend-only — doesn't need the functions build that the foreign analytics code currently breaks).
- **Auto-send "your photos are ready" on publish** — `photoShare.routes.ts` factored its bulk-send body into `sendPhotoLinksForGroom(uid,{force})`. The publish-flip hook in `media.routes.ts` (when `photographerPublished` goes false→true) now reads `galleryConfig.autoSendOnPublish` and, if on, calls it (best-effort, no-ops without WhatsApp). Groom toggle lives on the photographer page (`DigitalPhotographer.jsx`, bound to `patchGallery({autoSendOnPublish})`). `gallery.routes.ts` PATCH no longer demotes an approved gallery for operational-only flags (only `title/layout/coverPhoto` demote).

## DPIA-grade biometric consent gating (2026-06-30)

Built ahead of the **controlled soft launch** (invite-only, manual groom onboarding, payments off — see [[Architecture Decisions]]). Decision from a grilling session: go **full DPIA-grade**, not notice-only, because biometric face data in the Israeli market is the most legally sensitive surface.

- **Indexing is gated** — `faceIndex/trigger.ts` no longer auto-indexes on upload. A new `indexingDeferred(parentData)` helper (unit-tested in `backend/tests/functions/faceIndexGate.test.ts`) defers indexing (writes a `deferred_no_consent` status row, **zero AWS calls**) until the wedding opens its gate. A wedding already published before the gate existed keeps indexing (fallback on `photographerPublished`). The publish backfill (`touchUnindexedPhotographerFiles`) re-fires the trigger once the gate opens, preserving the cluster-on-publish flow.
- **Photographer acknowledgment** — first publish (`media.routes.ts` `/:uid/settings`) now returns `409 ack_required` unless `photographerAck:true`; the flip sets `indexingConsentGate:true` and audits the ack to the server-only `galleryConfig/config` subdoc. Front-end: a confirm modal in `DigitalPhotographer.jsx` (the groom affirms guests were notified that **all visible faces** are indexed) — this is the lawful basis for indexing passive subjects.
- **Affirmative consent** — selfie enroll (`photoFaces.ts`) and gallery OTP verify (`galleryAccess.routes.ts`) now require + record a `consent` block; front-end checkboxes gate the camera button (`DigitalYourPhotos.jsx`) and the OTP send (`PeopleGallery.jsx`). Client contract locked by `digitalPhotos.test.js` / `peopleGallery.test.js` / `services.test.js`.
- **Notice + DPIA** — biometric section added to `/terms` (`terms_privacy_sections`, AR+HE); `docs/DPIA-biometric.md` records data flows, lawful basis, retention, risks, sign-off.
- **Fast-follow (not yet built)** — the passive-subject **self-service opt-out** (`/g/:groomUsername/remove-me`: liveness selfie → `searchByImage` ≥90 → `deleteFaces`). Admin manual-erase (`gallery.routes.ts` `/erase-faces`) is the interim backstop. Open sub-decisions parked: opt-out match threshold, suppress-identifier-vs-redact-photo, re-index resurrection. See `~/.claude/plans/gleaming-puzzling-horizon.md`.

## Provisioning + verification

- AWS setup (IAM user + Cognito identity pool for Liveness) in `docs/AWS_REKOGNITION_SETUP.md`. Creds in `backend/functions/.env.local` (emulator/test) and `.env` (deploy); frontend `VITE_AWS_REGION` + `VITE_COGNITO_IDENTITY_POOL_ID` (region `us-east-1`; **pool still un-provisioned — blocked on AWS creds**).
- `npm run test:rekognition` — real-AWS accuracy test on `facerec_examples` (recall + cluster separation). `backend/scripts/verify-faces-e2e.cjs` + `verify-gallery-e2e.cjs` — full emulator + real-Rekognition e2e (both flows pass). One-time Firestore TTL on `guestFaces.expireAt` still applies.

See [[Audit Remediation 2026]], [[Security Model]], [[Data Storage Model]], [[WhatsApp Messaging]].
