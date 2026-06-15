// Backfill: make sure every existing photographer image has a face-index row.
//
// Touches stale/unindexed photographerFiles docs with `indexRequestedAt` —
// a content-noop field whose write fires the indexPhotographerFile trigger.
// The trigger's own freshness check makes re-touching an indexed file a
// no-op, so calling this repeatedly is safe.
//
// Wired to:
//   - PATCH /digital/:uid/settings when photographerPublished flips on
//   - POST  /digital/:uid/photographer/reindex (groom/admin recovery)

import { getFirestore } from "firebase-admin/firestore";
import { MODEL_VERSION } from "./match";
import { activeIndexVersion } from "./config";

/** Firestore batch hard limit is 500 ops; stay comfortably under. */
const BATCH_LIMIT = 400;

/**
 * Returns the number of files queued for (re-)indexing.
 */
export async function touchUnindexedPhotographerFiles(uid: string): Promise<number> {
  const fs = getFirestore();
  const [filesSnap, facesSnap] = await Promise.all([
    fs.collection(`digitalInvitations/${uid}/photographerFiles`).get(),
    fs.collection(`digitalInvitations/${uid}/photoFaces`).get(),
  ]);
  const indexRows = new Map(facesSnap.docs.map((d) => [d.id, d.data()]));
  const expectedVersion = activeIndexVersion(MODEL_VERSION);

  let touched = 0;
  let batch = fs.batch();
  let inBatch = 0;
  for (const doc of filesSnap.docs) {
    const data = doc.data();
    if (!String(data.type ?? "").startsWith("image/")) continue;
    const row = indexRows.get(doc.id);
    const fresh =
      row &&
      row.status === "ok" &&
      row.modelVersion === expectedVersion &&
      row.storagePath === data.storagePath;
    if (fresh) continue;

    batch.update(doc.ref, { indexRequestedAt: Date.now() });
    touched++;
    inBatch++;
    if (inBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = fs.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();
  return touched;
}
