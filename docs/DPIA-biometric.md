# Data Protection Impact Assessment — Biometric Face Matching

**System:** دعوة (Dawa) wedding-invitation platform — photographer face-matching gallery
**Scope of this assessment:** Controlled soft launch, limited to 1–5 weddings the operator personally onboards.
**Status:** Living document — update when the face-matching flow or its controls change.
**Owner / approver:** _<name to fill in before go-live>_
**Last reviewed:** _<date to fill in before go-live>_

---

## 1. System description & data flows

The platform offers an optional face-matching gallery so wedding guests can find the
photos they appear in. It uses **AWS Rekognition** (region per `AWS_REGION`) with a
per-wedding isolated collection (`dawa_{uid}`).

Two indexing streams exist:

| Stream | Whose data | Trigger | Stored where |
|---|---|---|---|
| Photographer photos | **Every face visible** in an uploaded photo (registered guests *and* passive non-registered subjects) | Firestore `onDocumentWritten` on `photographerFiles/{fileId}` → `backend/functions/src/faceIndex/trigger.ts` | Rekognition collection `dawa_{uid}` + `digitalInvitations/{uid}/photoFaces/{fileId}` |
| Guest selfie search | The searching guest's own face | Guest enrolls via AWS Face Liveness → `POST /digital/photos/enroll` (`backend/functions/src/api/routes/photoFaces.ts`) | Rekognition collection + `guestFaces/{tokenHash}` (carries `consent`) |

Matching / browsing:
- Guest selfie search page `/d/:groomUsername/:token/photos` (token-gated).
- People gallery `/g/:groomUsername` — phone → OTP → 24h grant → person tiles. Clustering
  via union-find on Rekognition `SearchFaces` (`backend/functions/src/faceIndex/clusterJob.ts`).

System of record for the flow: the files named above.

## 2. Categories of personal data

- **Special-category biometric data:** numeric facial templates ("face signatures").
  The source photo is retained for the gallery; the *biometric identifier* is a vector,
  not an image.
- **Contact data:** phone numbers (E.164), invite tokens.
- **No** raw selfie images are persisted — only the Rekognition `FaceId` is stored.

## 3. Lawful basis

- **Enrolled guests (selfie search / gallery viewers):** explicit, affirmative consent,
  captured as a required checkbox before any face is processed and recorded on the
  `guestFaces` doc / gallery grant (`consent: { biometric, version, at }`).
- **Passive subjects (faces in photographer photos):** processing is gated on the
  groom/photographer's **acknowledgment** that guests were notified, set at publish
  (`indexingConsentGate`, persisted ack in `galleryConfig/config`). No face is indexed
  until that gate opens. Passive subjects are given **notice + a self-service opt-out**
  (see §5) rather than per-person prior consent, which is not obtainable for someone
  who merely appears in a photo.
- **Reference law:** Israeli Privacy Protection Law, 1981 (consistent with the platform's
  published terms).

## 4. Necessity & proportionality

- Only a numeric signature is stored, not the biometric image.
- Collections are isolated per wedding (`dawa_{uid}`); no cross-event linkage.
- Indexing does not run at all until the gallery is published with acknowledgment, so an
  unpublished/abandoned wedding never processes biometric data.

## 5. Retention, deletion & data-subject rights

- **Automatic purge:** daily scheduled `purgeExpiredFaces` deletes the entire Rekognition
  collection + `photoFaces` + `guestFaces` + `peopleClusters` ~30 days post-wedding
  (`backend/functions/src/faceIndex/purge.ts`, `REKOGNITION_PURGE_DAYS`).
- **Guest self-delete:** `DELETE /digital/photos/enroll` removes the guest's face
  immediately (`photoFaces.ts`).
- **Admin manual erase:** `POST /:uid/gallery/erase-faces` (interim remedy for passive
  subjects until the self-service opt-out ships).
- **Passive-subject opt-out (fast-follow):** a `/g/:groomUsername/remove-me` flow that
  proves identity via a liveness selfie, matches it against the collection, and deletes
  the matching face vectors. _Until shipped, admin manual erase is the documented backstop._

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Indexing passive subjects without any lawful basis | `indexingConsentGate` + photographer ack before any indexing; notice in terms; opt-out / manual erase |
| Consent not actually obtained from active users | Affirmative checkbox required server-side (`consent_required` 400) before enroll / gallery grant |
| Biometric data outliving its purpose | 30-day auto-purge + face-row deletion on photo delete |
| Over-broad opt-out deleting another person's faces | High match threshold (≥90) + single-cluster confirmation (fast-follow design) |
| Data residency | Single AWS region; per-wedding isolated collection |
| Token / grant leakage | Tokens are server-only in RTDB; Sentry scrubs `token=` params |

## 7. Residual risk & sign-off

For a soft launch limited to 1–5 weddings with the operator personally onboarding each
groom, residual risk is **low–moderate**, driven mainly by the passive-subject opt-out
being a fast-follow rather than available at launch (mitigated by admin manual erase and
the publish-time acknowledgment gate). Wider/public launch **must** re-assess this
document, ship the self-service opt-out, and confirm the lawful-basis posture with counsel.

**Approved for soft launch by:** _<name>_ — _<date>_
