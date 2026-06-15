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

- **Personal** (`photoFaces.ts`): `POST /digital/photos/liveness/session` → AWS Face Liveness; `POST /enroll` (multipart selfie upload OR `livenessSessionId`) → IndexFaces guest → SearchFaces → matches; `GET /matches`; `DELETE /enroll` (DeleteFaces + erase); `GET /zip` (archiver stream from Storage). Frontend: upload-a-photo OR camera Liveness (`@aws-amplify/ui-react-liveness`, lazy-loaded, Cognito guest creds), phone capture, download-all.
- **Gallery** (`gallery.routes.ts` authed + `galleryAccess.routes.ts` public): groom/admin recompute + curate (hide/rename/merge) + approve + kill-switch (admin console = `AdminGallery.jsx`); public viewer enters phone → must be in the guest list → SMS code (reuses Firebase Identity Toolkit OTP) → 24h grant → themed person-tiles → person photos + ZIP. WhatsApp template bulk-send (`photoShare.routes.ts`) reuses each guest's existing token.

## Privacy / security

- Biometric collections are server-only; the selfie is uploaded + processed by AWS (consent copy updated to say so) and only a FaceId is kept.
- People gallery is **never public** — phone-OTP + guest-list membership + a per-wedding admin kill-switch (`enabled`, default off) + admin approval (`galleryStatus`).
- Auto-purge ~30 days post-wedding; guest opt-out erases their face immediately.

## Provisioning + verification

- AWS setup (IAM user + Cognito identity pool for Liveness) in `docs/AWS_REKOGNITION_SETUP.md`. Creds in `backend/functions/.env.local` (emulator/test) and `.env` (deploy); frontend `VITE_AWS_REGION` + `VITE_COGNITO_IDENTITY_POOL_ID`.
- `npm run test:rekognition` — real-AWS accuracy test on `facerec_examples` (recall + cluster separation). `backend/scripts/verify-faces-e2e.cjs` + `verify-gallery-e2e.cjs` — full emulator + real-Rekognition e2e (both flows pass). One-time Firestore TTL on `guestFaces.expireAt` still applies.

See [[Audit Remediation 2026]], [[Security Model]], [[Data Storage Model]], [[WhatsApp Messaging]].
