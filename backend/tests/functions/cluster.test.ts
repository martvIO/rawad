// Unit tests for the pure people-clustering (faceIndex/cluster.ts). Synthetic
// faces + similarity edges — no AWS.
import { describe, it, expect } from "vitest";
import {
  buildClusters,
  CLUSTER_MIN_SIMILARITY,
  ClusterFace,
  Neighbour,
} from "../../functions/src/faceIndex/cluster";

const box = { x: 0, y: 0, w: 0.1, h: 0.1 };

function face(faceId: string, fileId: string, confidence = 99): ClusterFace {
  return { faceId, fileId, confidence, box };
}

describe("buildClusters", () => {
  it("groups faces linked above the threshold into one person", () => {
    const faces = [face("p1a", "f1"), face("p1b", "f2"), face("p2a", "f3")];
    const neighbours: Neighbour[] = [
      { faceId: "p1a", neighbourId: "p1b", similarity: 96 },
      // p1 ↔ p2 link is below threshold, so they stay separate.
      { faceId: "p1a", neighbourId: "p2a", similarity: 40 },
    ];
    const clusters = buildClusters(faces, neighbours);
    expect(clusters).toHaveLength(2);
    const memberIds = clusters.map((c) => c.members.map((m) => m.faceId).sort().join(","));
    expect(memberIds).toContain("p1a,p1b");
    expect(memberIds).toContain("p2a");
  });

  it("transitively merges a chain a-b-c into one cluster", () => {
    const faces = [face("a", "f1"), face("b", "f2"), face("c", "f3")];
    const neighbours: Neighbour[] = [
      { faceId: "a", neighbourId: "b", similarity: 95 },
      { faceId: "b", neighbourId: "c", similarity: 95 },
    ];
    const clusters = buildClusters(faces, neighbours);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].photoCount).toBe(3);
  });

  it("counts distinct photos, not faces", () => {
    // Two faces of the same person in the SAME photo → photoCount 1.
    const faces = [face("x1", "f1"), face("x2", "f1")];
    const neighbours: Neighbour[] = [{ faceId: "x1", neighbourId: "x2", similarity: 99 }];
    const [cluster] = buildClusters(faces, neighbours);
    expect(cluster.members).toHaveLength(2);
    expect(cluster.photoCount).toBe(1);
  });

  it("picks the highest-confidence face as the representative", () => {
    const faces = [face("low", "f1", 80), face("high", "f2", 99)];
    const neighbours: Neighbour[] = [{ faceId: "low", neighbourId: "high", similarity: 95 }];
    const [cluster] = buildClusters(faces, neighbours);
    expect(cluster.rep.faceId).toBe("high");
  });

  it("treats an edge exactly at the threshold as a match", () => {
    const faces = [face("a", "f1"), face("b", "f2")];
    const neighbours: Neighbour[] = [
      { faceId: "a", neighbourId: "b", similarity: CLUSTER_MIN_SIMILARITY },
    ];
    expect(buildClusters(faces, neighbours)).toHaveLength(1);
  });

  it("ignores edges that reference unknown faces or are self-loops", () => {
    const faces = [face("a", "f1"), face("b", "f2")];
    const neighbours: Neighbour[] = [
      { faceId: "a", neighbourId: "ghost", similarity: 99 },
      { faceId: "a", neighbourId: "a", similarity: 99 },
    ];
    expect(buildClusters(faces, neighbours)).toHaveLength(2);
  });

  it("drops clusters below minPhotos when asked", () => {
    const faces = [face("p1a", "f1"), face("p1b", "f2"), face("solo", "f3")];
    const neighbours: Neighbour[] = [{ faceId: "p1a", neighbourId: "p1b", similarity: 96 }];
    const clusters = buildClusters(faces, neighbours, { minPhotos: 2 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].photoCount).toBe(2);
  });

  it("sorts by photoCount descending", () => {
    const faces = [
      face("a1", "f1"), face("a2", "f2"), face("a3", "f3"), // person A in 3 photos
      face("b1", "f4"), face("b2", "f5"), // person B in 2 photos
    ];
    const neighbours: Neighbour[] = [
      { faceId: "a1", neighbourId: "a2", similarity: 95 },
      { faceId: "a2", neighbourId: "a3", similarity: 95 },
      { faceId: "b1", neighbourId: "b2", similarity: 95 },
    ];
    const clusters = buildClusters(faces, neighbours);
    expect(clusters.map((c) => c.photoCount)).toEqual([3, 2]);
  });
});
