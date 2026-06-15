// Firestore trigger: index faces in every photographer photo.
//
// Watches digitalInvitations/{uid}/photographerFiles/{fileId} and maintains
// the parallel index digitalInvitations/{uid}/photoFaces/{fileId}:
//   - create/update of an image file → detect/index faces, store the index row
//   - delete of the file doc        → delete the index row (+ AWS faces)
//   - non-image files               → ignored entirely
//
// Two engines, chosen by config (isRekognitionConfigured):
//   - AWS Rekognition (creds set): IndexFaces into the wedding's collection;
//     the row stores {faceId, box, confidence} per face.
//   - legacy face-api (creds unset): the in-process tfjs/WASM engine; the row
//     stores {d: number[128]} per face. Kept so dev/emulator never regress.
// Each row stamps its `modelVersion`; a freshness check re-indexes rows from
// the wrong engine automatically (e.g. after AWS creds are first added).
//
// Heavy modules (the face-api engine, the AWS SDK + canvas) are loaded via
// dynamic import() INSIDE the handler so the `api` function — which shares this
// deploy bundle — never pays their cold-start cost.

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { MODEL_VERSION } from "./match";
import { isRekognitionConfigured, activeIndexVersion } from "./config";

/** Mirrors engine.MAX_DECODE_BYTES without importing the heavy module. */
const MAX_DECODE_BYTES = 80 * 1024 * 1024;

export const indexPhotographerFile = onDocumentWritten(
  {
    document: "digitalInvitations/{uid}/photographerFiles/{fileId}",
    region: "us-central1",
    memory: "2GiB",
    timeoutSeconds: 300,
    // Bounds cost + concurrent work when a photographer bulk-uploads hundreds
    // of photos; the queue drains in the background. Rekognition has ample
    // per-account TPS, so a small bump over the face-api default is safe.
    maxInstances: 6,
    retry: false,
  },
  async (event) => {
    const { uid, fileId } = event.params;
    const fs = getFirestore();
    const indexRef = fs.doc(`digitalInvitations/${uid}/photoFaces/${fileId}`);

    const after = event.data?.after;
    if (!after?.exists) {
      // File deleted — biometric index rows must not outlive the photo.
      try {
        if (isRekognitionConfigured()) {
          const prior = await indexRef.get();
          const faceIds = collectFaceIds(prior.data());
          if (faceIds.length) {
            const rek = await import("./rekognition.js");
            await rek.deleteFaces(uid, faceIds).catch((err) => {
              console.error(`[faceIndex] AWS face cleanup failed for ${uid}/${fileId}`, err);
            });
          }
        }
      } finally {
        await indexRef.delete().catch((err) => {
          console.error(`[faceIndex] cleanup failed for ${uid}/${fileId}`, err);
        });
      }
      return;
    }

    const data = after.data() ?? {};
    const type = String(data.type ?? "");
    const storagePath = String(data.storagePath ?? "");
    if (!type.startsWith("image/") || !storagePath) return;

    const expectedVersion = activeIndexVersion(MODEL_VERSION);

    // Idempotency: a fresh row for the ACTIVE engine means nothing to do
    // (covers renames, backfill re-touches, and at-least-once redelivery).
    const existing = await indexRef.get();
    if (existing.exists) {
      const row = existing.data() ?? {};
      if (
        row.status === "ok" &&
        row.modelVersion === expectedVersion &&
        row.storagePath === storagePath
      ) {
        return;
      }
    }

    const writeRow = async (
      status: string,
      faces: Record<string, unknown>[],
      extra: Record<string, unknown> = {},
      error?: string,
    ) => {
      await indexRef.set({
        storagePath,
        faces,
        faceCount: faces.length,
        indexedAt: Date.now(),
        modelVersion: expectedVersion,
        status,
        ...extra,
        ...(error ? { error: error.slice(0, 500) } : {}),
      });
    };

    try {
      const file = getStorage().bucket().file(storagePath);
      // Size gate from metadata so we never download a pathological file.
      const [meta] = await file.getMetadata();
      const size = Number(meta.size ?? 0);
      if (size > MAX_DECODE_BYTES) {
        await writeRow("skipped_too_large", [], {}, `object is ${size} bytes`);
        return;
      }

      const [buffer] = await file.download();

      if (isRekognitionConfigured()) {
        const rek = await import("./rekognition.js");
        // Re-index: drop any faces a prior version of this file left in AWS.
        const priorFaceIds = collectFaceIds(existing.data());
        if (priorFaceIds.length) {
          await rek.deleteFaces(uid, priorFaceIds).catch(() => undefined);
        }
        const faces = await rek.indexPhotoFaces(uid, fileId, buffer);
        await writeRow("ok", faces, {
          provider: "rekognition",
          collectionId: rek.collectionId(uid),
        });
        // Mark the gallery's clustering as needing a recompute (consumed later
        // by the clustering job); harmless until that job exists.
        await fs
          .doc(`digitalInvitations/${uid}`)
          .set({ clusterDirty: true, clusterDirtyAt: Date.now() }, { merge: true })
          .catch(() => undefined);
        console.log(`[faceIndex] ${uid}/${fileId}: rekognition ok, ${faces.length} face(s)`);
        return;
      }

      // Legacy face-api fallback (no AWS creds).
      const engine = await import("./engine.js");
      const outcome = await engine.detectFacesInImage(buffer);
      await writeRow(
        outcome.status,
        outcome.faces,
        {},
        "error" in outcome ? outcome.error : undefined,
      );
      console.log(`[faceIndex] ${uid}/${fileId}: faceapi ${outcome.status}, ${outcome.faces.length} face(s)`);
    } catch (err) {
      // retry:false — persist the failure so it is observable and the
      // reindex endpoint can re-touch it later. Never throw.
      console.error(`[faceIndex] indexing failed for ${uid}/${fileId}`, err);
      await writeRow("failed", [], {}, err instanceof Error ? err.message : String(err)).catch(
        () => undefined,
      );
    }
  },
);

/** Pull stored Rekognition faceIds out of a photoFaces row (any shape). */
function collectFaceIds(row: Record<string, unknown> | undefined): string[] {
  const faces = (row?.faces as { faceId?: string }[] | undefined) ?? [];
  return faces.map((f) => f?.faceId).filter((id): id is string => typeof id === "string");
}
