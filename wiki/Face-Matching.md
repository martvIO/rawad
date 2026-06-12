---
date: 2026-06-12
sources:
  - session 2026-06-12 (server-side face index build)
tags: [digital, biometric, faces, firestore, functions, concept]
---

# Face Matching

The "صورك / your photos" feature on the public digital invitation (`/d/:groomUsername/:token/photos`, `src/pages/DigitalYourPhotos.jsx`): a guest scans their face once and gets every published photographer photo they appear in. Part of [[Digital Invitations]].

## Architecture (server-side face index, 2026-06-12)

Replaced the original fully-in-browser matcher (which re-scanned ≤80 photos on the guest's phone every visit and stored nothing) with a split design:

- **Indexing (once per photo)** — Firestore trigger `indexPhotographerFile` (`functions/src/faceIndex/trigger.ts`, gen2, 2GiB, maxInstances 3) watches `digitalInvitations/{uid}/photographerFiles/{fileId}`. For every `image/*` upload it downloads the object, detects all faces, and writes 128-D descriptors to `digitalInvitations/{uid}/photoFaces/{fileId}` (`{storagePath, faces:[{d:[128]}], faceCount, indexedAt, modelVersion, status}`). Deleting the file deletes the row. Engine: `@vladmandic/face-api` on the **tfjs WASM backend** (no native binaries, identical on Windows/emulator/Cloud Run), images decoded + downscaled to 2048px via `@napi-rs/canvas`, SSD MobileNet detector. The engine is dynamically imported inside the handler so the `api` function never loads tfjs.
- **Enrollment (once per guest)** — after an explicit AR/HE **consent screen**, the existing camera + head-turn liveness flow extracts ONE descriptor **in the browser** (the selfie never leaves the device); `POST /digital/photos/enroll` stores it at `digitalInvitations/{uid}/guestFaces/{sha256(token)}` with `consentAt` and `expireAt` (Firestore `Timestamp` = token expiry, for a TTL policy). Token is hashed because it is a bearer credential.
- **Matching (per request, pure math)** — `GET /digital/photos/matches?token=…` compares the stored guest descriptor against all `photoFaces` rows (euclidean ≤ 0.5, best face per photo, sorted) and joins display fields from `photographerFiles`. No cap, no image downloads. The page polls it at 15s, so an enrolled guest gets an **instant gallery with no camera** and newly uploaded photos appear automatically. `DELETE /digital/photos/enroll` = guest's erasure button.

## Descriptor compatibility — the load-bearing invariant

Browser and server MUST produce comparable descriptors. Both load the **byte-identical `face_recognition_model` weights** (`public/models` ↔ `functions/models`, synced by `scripts/download-face-models.cjs`); detectors may differ (TinyFaceDetector in-browser vs SSD MobileNet server-side) since they only affect recall, not the descriptor space. Every stored row carries `modelVersion: "faceapi-frn-v1"` and the matcher filters on it — never upgrade `face-api.js` (pinned 0.22.2) or the weights on one side only. Verified empirically: same face across stacks 0.089–0.158, different faces ≥ 0.643 (threshold 0.5).

## Backfill + recovery

`touchUnindexedPhotographerFiles(uid)` (`functions/src/faceIndex/backfill.ts`) stamps `indexRequestedAt` on stale/unindexed image docs to re-fire the trigger (idempotent — fresh rows short-circuit). Wired to the `photographerPublished` false→true flip in `PATCH /digital/:uid/settings` and to `POST /digital/:uid/photographer/reindex` (groom/admin, for pre-existing uploads or failed rows; rows carry `status: ok|failed_decode|skipped_too_large|failed` for observability). HEIC files land as `failed_decode` (canvas can't decode them).

## Privacy / security posture

- Descriptors are **biometric data**: `photoFaces` + `guestFaces` are explicitly `allow read, write: if false` in `firestore.rules` (Admin SDK only); descriptors never appear in API responses.
- Consent screen (with the auto-delete date rendered) gates the first scan; `consentAt` is stored. UI copy now says "camera image stays on your device; only a numeric signature is stored" — the old "nothing leaves your device" promise is gone.
- **Firestore TTL policy on `guestFaces.expireAt`** garbage-collects enrollments when the token expires. ONE-TIME manual setup (not in firebase.json):
  `gcloud firestore fields ttls update expireAt --collection-group=guestFaces --enable-ttl --project dawa-aa793`
  Endpoints also enforce token expiry (410) independently since TTL deletion lags ≤24h.
- Rate limiting: `tokenRateLimit` middleware — keyed **per token** with a per-IP backstop, because wedding guests share the venue NAT IP ([[Security Model]]).

## Gotchas

- Commit `280ccf6` removed `groomUid` from the public token projection and silently broke the old photos page (it read `rec.groomUid`); the rework fixed it structurally — the server resolves the groom from the token, and `groomUid` must stay un-exposed.
- WASM throughput ~0.5–3s/photo: a 500-photo bulk upload indexes over tens of minutes at maxInstances 3 — fine, uploads precede guests by days; the reindex endpoint recovers stragglers.
- Camera/liveness can't be tested headlessly (needs a real face) — manual phone smoke item after deploys.
