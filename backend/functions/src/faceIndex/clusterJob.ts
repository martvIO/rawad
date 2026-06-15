// People-clustering job — turns the per-photo Rekognition face index into
// person clusters for the "People" gallery.
//
// Rekognition has no "group a whole collection" call, so for each indexed photo
// face we ask SearchFaces for its neighbours, union-find them (cluster.ts), and
// persist one doc per person at digitalInvitations/{uid}/peopleClusters/{id}.
//
// Runs two ways:
//   - on demand (admin/groom "recompute people" button → recomputeClusters)
//   - auto-debounced: the indexing trigger stamps clusterDirty; a scheduled
//     function reclusters grooms whose upload burst has settled, so a 1,500-photo
//     batch reclusters once, not 1,500 times.
//
// Manual curation (hide/rename/link-phone) is preserved across recompute by
// keying the overrides on FaceIds, which are stable until a photo is re-indexed.

import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { buildClusters, CLUSTER_MIN_SIMILARITY, ClusterFace, Neighbour } from "./cluster";
import { isRekognitionConfigured } from "./config";

type CurationOverride = { label: unknown; hidden: boolean; linkedPhone: string | null };

/** Recompute every person cluster for a wedding. Returns the resulting counts. */
export async function recomputeClusters(
  uid: string,
): Promise<{ clusterCount: number; faceCount: number; skipped?: string }> {
  const fs = getFirestore();
  const jobRef = fs.doc(`digitalInvitations/${uid}/jobStatus/clustering`);
  const stamp = (extra: Record<string, unknown>) =>
    jobRef.set({ updatedAt: Date.now(), ...extra }, { merge: true });

  await stamp({ phase: "clustering", startedAt: Date.now(), error: null });

  if (!isRekognitionConfigured()) {
    await stamp({ phase: "failed", error: "rekognition_not_configured" });
    return { clusterCount: 0, faceCount: 0, skipped: "not_configured" };
  }
  const rek = await import("./rekognition.js");

  // 1. Gather all indexed photo faces + their photo metadata.
  const [facesSnap, filesSnap] = await Promise.all([
    fs.collection(`digitalInvitations/${uid}/photoFaces`).get(),
    fs.collection(`digitalInvitations/${uid}/photographerFiles`).get(),
  ]);
  const fileMeta = new Map(filesSnap.docs.map((d) => [d.id, d.data()]));
  const faces: ClusterFace[] = [];
  for (const d of facesSnap.docs) {
    const row = d.data();
    if (row.status !== "ok") continue;
    for (const f of (row.faces as { faceId?: string; box?: unknown; confidence?: number }[]) || []) {
      if (!f.faceId) continue;
      faces.push({
        faceId: f.faceId,
        fileId: d.id,
        confidence: typeof f.confidence === "number" ? f.confidence : 0,
        box: (f.box as ClusterFace["box"]) ?? { x: 0, y: 0, w: 0, h: 0 },
      });
    }
  }
  await stamp({ faceCount: faces.length });

  // 2. Neighbour edges via SearchFaces (sequential — Rekognition TPS friendly).
  const neighbours: Neighbour[] = [];
  for (const f of faces) {
    const hits = await rek.searchByFaceId(uid, f.faceId, CLUSTER_MIN_SIMILARITY).catch(() => []);
    for (const h of hits) {
      if (h.faceId !== f.faceId) {
        neighbours.push({ faceId: f.faceId, neighbourId: h.faceId, similarity: h.similarity });
      }
    }
  }

  // 3. Cluster.
  const clusters = buildClusters(faces, neighbours);

  // 4. Capture manual-curation overrides (keyed on member FaceId).
  const clustersCol = fs.collection(`digitalInvitations/${uid}/peopleClusters`);
  const existing = await clustersCol.get();
  const overrideByFace = new Map<string, CurationOverride>();
  for (const d of existing.docs) {
    const c = d.data();
    if (!c.manual) continue;
    const ov: CurationOverride = {
      label: c.label ?? null,
      hidden: !!c.hidden,
      linkedPhone: (c.linkedPhone as string) ?? null,
    };
    for (const m of (c.members as { faceId?: string }[]) || []) {
      if (m.faceId) overrideByFace.set(m.faceId, ov);
    }
  }

  // 5. Replace the cluster set (delete old, write new) carrying overrides over.
  await commitInChunks(existing.docs.map((d) => () => d.ref.delete()));

  const writes: (() => Promise<unknown>)[] = [];
  for (const cl of clusters) {
    const ref = clustersCol.doc();
    const repMeta = (fileMeta.get(cl.rep.fileId) ?? {}) as { storagePath?: string; url?: string; name?: string };
    const ov =
      overrideByFace.get(cl.rep.faceId) ||
      cl.members.map((m) => overrideByFace.get(m.faceId)).find(Boolean) ||
      null;
    writes.push(() =>
      ref.set({
        rep: {
          faceId: cl.rep.faceId,
          fileId: cl.rep.fileId,
          box: cl.rep.box,
          storagePath: repMeta.storagePath ?? null,
          url: repMeta.url ?? null,
        },
        members: cl.members.map((m) => ({ faceId: m.faceId, fileId: m.fileId, box: m.box })),
        photoCount: cl.photoCount,
        memberCount: cl.members.length,
        label: ov?.label ?? null,
        hidden: ov?.hidden ?? false,
        linkedPhone: ov?.linkedPhone ?? null,
        manual: ov ? true : false,
        updatedAt: Date.now(),
      }),
    );
  }
  await commitInChunks(writes);

  await stamp({ phase: "done", clusterCount: clusters.length, faceCount: faces.length });
  await fs.doc(`digitalInvitations/${uid}`).set({ clusterDirty: false }, { merge: true }).catch(() => undefined);
  return { clusterCount: clusters.length, faceCount: faces.length };
}

/** Run a list of write thunks with bounded concurrency (avoids batch limits). */
async function commitInChunks(thunks: (() => Promise<unknown>)[], size = 50): Promise<void> {
  for (let i = 0; i < thunks.length; i += size) {
    await Promise.all(thunks.slice(i, i + size).map((t) => t().catch(() => undefined)));
  }
}

/** Quiet period after the last index before a dirty gallery reclusters. */
const SETTLE_MS = 3 * 60 * 1000;

export const reclusterDirtyGalleries = onSchedule(
  { schedule: "every 10 minutes", region: "us-central1", memory: "2GiB", timeoutSeconds: 540 },
  async () => {
    if (!isRekognitionConfigured()) return;
    const fs = getFirestore();
    const snap = await fs.collection("digitalInvitations").where("clusterDirty", "==", true).get();
    const now = Date.now();
    for (const d of snap.docs) {
      const dirtyAt = Number(d.data()?.clusterDirtyAt ?? 0);
      if (now - dirtyAt < SETTLE_MS) continue; // let the upload burst settle
      await recomputeClusters(d.id).catch((err) => console.error("[recluster]", d.id, err));
    }
  },
);
