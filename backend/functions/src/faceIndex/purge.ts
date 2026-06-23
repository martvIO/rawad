// Biometric auto-purge — the 30-day-after-the-wedding privacy commitment.
//
// Rekognition Collections persist face vectors in AWS, so (unlike the Firestore
// guestFaces TTL) deletion must be explicit. A daily scheduled job deletes the
// whole per-wedding collection + all Firestore face data once the wedding is
// more than REKOGNITION_PURGE_DAYS (default 30) in the past. Admin/groom can
// also erase immediately, and a guest opt-out (DELETE /enroll) already removes
// just their own face.

import { getFirestore, Firestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { isRekognitionConfigured } from "./config";

const PURGE_DAYS = Number(process.env.REKOGNITION_PURGE_DAYS || 30);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Delete every doc in a collection in chunks. A commit failure propagates so
 *  the caller aborts BEFORE recording the purge as complete (see below). */
async function clearCollection(fs: Firestore, path: string): Promise<void> {
  const snap = await fs.collection(path).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = fs.batch();
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}

/** Erase ALL face data for a wedding (AWS collection + Firestore rows). */
export async function purgeWeddingFaces(uid: string): Promise<void> {
  // Resolve the AWS deleter only when Rekognition is configured; otherwise there
  // is no collection to remove and the purge is Firestore-only.
  const deleteAwsCollection = isRekognitionConfigured()
    ? (await import("./rekognition.js")).deleteCollection
    : null;
  await purgeWeddingFacesWith(getFirestore(), uid, deleteAwsCollection);
}

/**
 * Testable core of {@link purgeWeddingFaces}. Deps are injected (Firestore +
 * the AWS collection deleter) so the success/failure invariant can be unit
 * tested without a live Firestore or AWS.
 *
 * Ordering matters: delete the AWS Rekognition collection FIRST. That collection
 * is the ONLY copy of the biometric face vectors and the one thing that can't be
 * TTL'd, so it must be gone before we record the purge as complete.
 * `deleteCollection` is idempotent (a ResourceNotFoundException counts as
 * success), so retrying after a partial failure is safe. A REAL failure (AWS
 * throttle / IAM / network, or a Firestore batch failure) propagates and aborts
 * BEFORE the stamp below — leaving `facesPurgedAt` unset so the daily
 * `purgeExpiredFaces` job retries the wedding, instead of silently marking it
 * "purged" while the faces persist in AWS forever (a breach of the 30-day
 * privacy commitment).
 */
export async function purgeWeddingFacesWith(
  fs: Firestore,
  uid: string,
  deleteAwsCollection: ((uid: string) => Promise<void>) | null,
): Promise<void> {
  if (deleteAwsCollection) await deleteAwsCollection(uid);
  await clearCollection(fs, `digitalInvitations/${uid}/photoFaces`);
  await clearCollection(fs, `digitalInvitations/${uid}/guestFaces`);
  await clearCollection(fs, `digitalInvitations/${uid}/peopleClusters`);
  // Only now — every delete above succeeded — record the purge as complete.
  await fs
    .doc(`digitalInvitations/${uid}`)
    .set({ facesPurgedAt: Date.now(), clusterDirty: false }, { merge: true });
}

/** Resolve a wedding's effective purge date (epoch ms), or 0 if unknown.
 *  Falls back to creation-time + 90d for UNDATED weddings so abandoned events
 *  can't retain biometric data forever (without a date the old code returned 0
 *  and the wedding was never purged). createdAt+90d vs the 30d cutoff means an
 *  undated wedding's faces purge ~120 days after it was created. */
async function weddingDate(fs: Firestore, uid: string, parent: Record<string, unknown>): Promise<number> {
  const direct = Number(parent.weddingDate ?? 0);
  if (direct) return direct;
  const defaultId = parent.defaultDesignId as string | undefined;
  let designCreated = 0;
  if (defaultId) {
    const d = await fs.doc(`digitalInvitations/${uid}/designs/${defaultId}`).get();
    const data = d.exists ? d.data() : undefined;
    const designWedding = Number(data?.weddingDate ?? 0);
    if (designWedding) return designWedding;
    designCreated = Number(data?.createdAt ?? 0);
  }
  const created = designCreated || Number(parent.createdAt ?? 0);
  return created ? created + 90 * DAY_MS : 0;
}

export const purgeExpiredFaces = onSchedule(
  { schedule: "every 24 hours", region: "us-central1", timeoutSeconds: 540 },
  async () => {
    const fs = getFirestore();
    const snap = await fs.collection("digitalInvitations").get();
    const cutoff = Date.now() - PURGE_DAYS * DAY_MS;
    for (const d of snap.docs) {
      const data = d.data();
      if (data.facesPurgedAt) continue; // already purged
      const wd = await weddingDate(fs, d.id, data);
      if (!wd || wd > cutoff) continue; // unknown date or still within the window
      // Only purge weddings that actually have face data to clear.
      const faces = await fs.collection(`digitalInvitations/${d.id}/photoFaces`).limit(1).get();
      const guests = await fs.collection(`digitalInvitations/${d.id}/guestFaces`).limit(1).get();
      if (faces.empty && guests.empty) continue;
      await purgeWeddingFaces(d.id).catch((err) => console.error("[purge]", d.id, err));
    }
  },
);
