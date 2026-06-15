// People-clustering — pure, no AWS/Firebase imports, fully unit-testable.
//
// Rekognition has no one-shot "group every face in a collection" call, so we
// build it: for each indexed photo-face we ask SearchFaces for its neighbours
// (faces above a similarity threshold), turn those into edges, and union-find
// the edges into person clusters. The SDK fan-out lives in clusterJob.ts; the
// graph math lives here so it can be tested on synthetic data without AWS.
//
// Clustering is inherently imperfect (one person can split into two clusters,
// two people can merge). We bias AGAINST merging by clustering at a tighter
// similarity than 1:1 matching, pick a stable representative (highest face
// confidence), and let admins curate (merge/split/hide) downstream.

import { FaceBox } from "./match";

// Similarity (0..100) at/above which two faces are treated as the same person.
// Chosen from the empirical gap measured on real photos (scripts/rek-diagnose):
// same-person face pairs score ~95-100, different people sit below ~85, and
// 85-95 is nearly empty — so a cutoff in the low 90s separates cleanly while
// still consolidating a person whose harder shots dip toward 90.
export const CLUSTER_MIN_SIMILARITY = 90;

/** One indexed face fed into clustering. */
export type ClusterFace = {
  faceId: string;
  fileId: string;
  confidence: number;
  box: FaceBox;
};

/** A discovered person: representative face + all member faces. */
export type Cluster = {
  rep: ClusterFace;
  members: ClusterFace[];
  /** Distinct source photos this person appears in. */
  photoCount: number;
};

/** A neighbour edge from SearchFaces: `faceId` matched `neighbourId` at `similarity`. */
export type Neighbour = { faceId: string; neighbourId: string; similarity: number };

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root) as string;
    // Path compression.
    let cur = id;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur) as string;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Group faces into person clusters.
 *
 * @param faces      every indexed photo-face (faceId unique).
 * @param neighbours SearchFaces edges; only edges whose BOTH endpoints are in
 *                   `faces` and whose similarity ≥ threshold are honoured.
 * @param opts.minSimilarity  similarity cutoff (default CLUSTER_MIN_SIMILARITY).
 * @param opts.minPhotos      drop clusters appearing in fewer than this many
 *                            distinct photos (default 1 = keep everyone).
 * Returns clusters sorted by photoCount desc, then member count desc.
 */
export function buildClusters(
  faces: ClusterFace[],
  neighbours: Neighbour[],
  opts: { minSimilarity?: number; minPhotos?: number } = {},
): Cluster[] {
  const minSimilarity = opts.minSimilarity ?? CLUSTER_MIN_SIMILARITY;
  const minPhotos = opts.minPhotos ?? 1;

  const byId = new Map(faces.map((f) => [f.faceId, f]));
  const uf = new UnionFind();
  for (const f of faces) uf.add(f.faceId);

  for (const n of neighbours) {
    if (n.similarity < minSimilarity) continue;
    if (!byId.has(n.faceId) || !byId.has(n.neighbourId)) continue;
    if (n.faceId === n.neighbourId) continue;
    uf.union(n.faceId, n.neighbourId);
  }

  const groups = new Map<string, ClusterFace[]>();
  for (const f of faces) {
    const root = uf.find(f.faceId);
    const arr = groups.get(root) ?? [];
    arr.push(f);
    groups.set(root, arr);
  }

  const clusters: Cluster[] = [];
  for (const members of groups.values()) {
    const photoCount = new Set(members.map((m) => m.fileId)).size;
    if (photoCount < minPhotos) continue;
    // Representative = highest-confidence face (stable across recompute).
    const rep = members.reduce((best, m) => (m.confidence > best.confidence ? m : best), members[0]);
    clusters.push({ rep, members, photoCount });
  }

  clusters.sort((a, b) => b.photoCount - a.photoCount || b.members.length - a.members.length);
  return clusters;
}
