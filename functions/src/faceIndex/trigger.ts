// Firestore trigger: index faces in every photographer photo.
//
// Watches digitalInvitations/{uid}/photographerFiles/{fileId} and maintains
// the parallel index digitalInvitations/{uid}/photoFaces/{fileId}:
//   - create/update of an image file → detect faces, store 128-D descriptors
//   - delete of the file doc        → delete the index row
//   - non-image files               → ignored entirely
//
// Idempotent and at-least-once safe: an existing fresh row (status ok, same
// model version, same storage path) short-circuits, which also makes rename
// PATCHes and backfill re-touches of already-indexed files no-ops.
//
// The detection engine is loaded via dynamic import() inside the handler so
// the `api` function — which shares this deploy bundle — never pays the
// tfjs/WASM/model cost on ITS cold starts.

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { MODEL_VERSION } from "./match";

/** Mirrors engine.MAX_DECODE_BYTES without importing the heavy module. */
const MAX_DECODE_BYTES = 80 * 1024 * 1024;

export const indexPhotographerFile = onDocumentWritten(
  {
    document: "digitalInvitations/{uid}/photographerFiles/{fileId}",
    region: "us-central1",
    memory: "2GiB",
    timeoutSeconds: 300,
    // Bounds cost and concurrent model loads when a photographer bulk-uploads
    // hundreds of photos; the queue drains in the background.
    maxInstances: 3,
    retry: false,
  },
  async (event) => {
    const { uid, fileId } = event.params;
    const indexRef = getFirestore().doc(
      `digitalInvitations/${uid}/photoFaces/${fileId}`,
    );

    const after = event.data?.after;
    if (!after?.exists) {
      // File deleted — biometric index rows must not outlive the photo.
      await indexRef.delete().catch((err) => {
        console.error(`[faceIndex] cleanup failed for ${uid}/${fileId}`, err);
      });
      return;
    }

    const data = after.data() ?? {};
    const type = String(data.type ?? "");
    const storagePath = String(data.storagePath ?? "");
    if (!type.startsWith("image/") || !storagePath) return;

    // Idempotency: a fresh row means nothing to do (covers renames, backfill
    // re-touches, and at-least-once redelivery).
    const existing = await indexRef.get();
    if (existing.exists) {
      const row = existing.data() ?? {};
      if (
        row.status === "ok" &&
        row.modelVersion === MODEL_VERSION &&
        row.storagePath === storagePath
      ) {
        return;
      }
    }

    const writeRow = async (
      status: string,
      faces: { d: number[] }[],
      error?: string,
    ) => {
      await indexRef.set({
        storagePath,
        faces,
        faceCount: faces.length,
        indexedAt: Date.now(),
        modelVersion: MODEL_VERSION,
        status,
        ...(error ? { error: error.slice(0, 500) } : {}),
      });
    };

    try {
      const file = getStorage().bucket().file(storagePath);
      // Size gate from metadata so we never download a pathological file.
      const [meta] = await file.getMetadata();
      const size = Number(meta.size ?? 0);
      if (size > MAX_DECODE_BYTES) {
        await writeRow("skipped_too_large", [], `object is ${size} bytes`);
        return;
      }

      const [buffer] = await file.download();
      // Lazy-load the heavy engine only when there is real work to do.
      const engine = await import("./engine.js");
      const outcome = await engine.detectFacesInImage(buffer);
      await writeRow(outcome.status, outcome.faces, "error" in outcome ? outcome.error : undefined);
      console.log(
        `[faceIndex] ${uid}/${fileId}: ${outcome.status}, ${outcome.faces.length} face(s)`,
      );
    } catch (err) {
      // retry:false — persist the failure so it is observable and the
      // reindex endpoint can re-touch it later. Never throw.
      console.error(`[faceIndex] indexing failed for ${uid}/${fileId}`, err);
      await writeRow("failed", [], err instanceof Error ? err.message : String(err)).catch(
        () => undefined,
      );
    }
  },
);
