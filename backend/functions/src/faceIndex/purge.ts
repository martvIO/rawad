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

/** Delete every doc in a collection in chunks. */
async function clearCollection(fs: Firestore, path: string): Promise<void> {
  const snap = await fs.collection(path).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = fs.batch();
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit().catch(() => undefined);
  }
}

/** Erase ALL face data for a wedding (AWS collection + Firestore rows). */
export async function purgeWeddingFaces(uid: string): Promise<void> {
  if (isRekognitionConfigured()) {
    const rek = await import("./rekognition.js");
    await rek.deleteCollection(uid).catch(() => undefined);
  }
  const fs = getFirestore();
  await clearCollection(fs, `digitalInvitations/${uid}/photoFaces`);
  await clearCollection(fs, `digitalInvitations/${uid}/guestFaces`);
  await clearCollection(fs, `digitalInvitations/${uid}/peopleClusters`);
  await fs
    .doc(`digitalInvitations/${uid}`)
    .set({ facesPurgedAt: Date.now(), clusterDirty: false }, { merge: true })
    .catch(() => undefined);
}

/** Resolve a wedding's date (epoch ms) from its default design, or 0. */
async function weddingDate(fs: Firestore, uid: string, parent: Record<string, unknown>): Promise<number> {
  const direct = Number(parent.weddingDate ?? 0);
  if (direct) return direct;
  const defaultId = parent.defaultDesignId as string | undefined;
  if (!defaultId) return 0;
  const d = await fs.doc(`digitalInvitations/${uid}/designs/${defaultId}`).get();
  return Number(d.exists ? d.data()?.weddingDate ?? 0 : 0);
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
