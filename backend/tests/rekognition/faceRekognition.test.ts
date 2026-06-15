// REAL AWS Rekognition accuracy test over the facerec_examples fixtures.
//
// Phase-1 empirical go/no-go for the live engine. Calls the real service, so:
//   - needs AWS creds (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION),
//   - costs a few cents per run,
//   - is EXCLUDED from `test:unit` / CI and auto-skips without creds.
// Run with:  npm run test:rekognition
//
// What the fixtures actually are (confirmed via scripts/rek-diagnose): graduation
// GROUP photos — ~22 distinct attendees across 16 photos (53 faces). person_1 and
// person_2 are two of them, each appearing in many shots. The finial_data folders
// label only a burst-subset per person, so they are a RECALL floor, not the
// complete "who is in each photo" truth. Same-person face pairs score ~95-100;
// different people score < ~85 — a clean gap the thresholds sit inside.
//
// So we assert what's real:
//   1. recall — each person's selfie finds at least their finial_data photos;
//   2. clustering consolidates each enrolled person into a single, distinct
//      cluster (it does NOT collapse the whole event into two people).

import "./_loadCreds"; // must run before isRekognitionConfigured() is read
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isRekognitionConfigured } from "../../functions/src/faceIndex/config";
import {
  ensureCollection,
  indexPhotoFaces,
  searchByImage,
  searchByFaceId,
  deleteCollection,
} from "../../functions/src/faceIndex/rekognition";
import { joinRekognitionMatches, PhotoFileRow } from "../../functions/src/faceIndex/match";
import {
  buildClusters,
  ClusterFace,
  Neighbour,
  CLUSTER_MIN_SIMILARITY,
} from "../../functions/src/faceIndex/cluster";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "..", "..", "..", "facerec_examples");

// Throwaway collection so a run never touches real wedding data.
process.env.REKOGNITION_COLLECTION_PREFIX = "dawatest";
const TEST_UID = `itest${Date.now()}`;

const IMG_RE = /\.(jpe?g|png)$/i;
const listImages = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => IMG_RE.test(n)) : [];
function firstImage(dir: string): string {
  const imgs = listImages(dir);
  if (!imgs.length) throw new Error(`no selfie image in ${dir}`);
  return path.join(dir, imgs[0]);
}

// Suite-wide state built once in beforeAll.
const fileRows: PhotoFileRow[] = [];
const allFaces: ClusterFace[] = [];
const faceToCluster = new Map<string, number>(); // faceId -> cluster index
type Probe = { recallNames: Set<string>; faceIds: string[] };
const probes = new Map<string, Probe>();

const run = isRekognitionConfigured();

describe.skipIf(!run)("Rekognition accuracy on facerec_examples", () => {
  beforeAll(async () => {
    await ensureCollection(TEST_UID);

    // 1. Index the whole pool.
    const poolDir = path.join(FIXTURES, "photos_from_the_photographer");
    const names = listImages(poolDir);
    expect(names.length).toBeGreaterThan(0);
    let i = 0;
    for (const name of names) {
      const fileId = `p${i++}`;
      fileRows.push({ fileId, name, url: `file://${name}`, type: "image/jpeg" });
      const faces = await indexPhotoFaces(TEST_UID, fileId, fs.readFileSync(path.join(poolDir, name)));
      for (const f of faces) {
        allFaces.push({ faceId: f.faceId, fileId, confidence: f.confidence, box: f.box });
      }
    }
    // Group photos with many attendees → far more faces than photos.
    expect(allFaces.length).toBeGreaterThan(names.length);

    // 2. Cluster everyone via SearchFaces neighbours.
    const neighbours: Neighbour[] = [];
    for (const f of allFaces) {
      const hits = await searchByFaceId(TEST_UID, f.faceId, CLUSTER_MIN_SIMILARITY);
      for (const h of hits) {
        if (h.faceId !== f.faceId) {
          neighbours.push({ faceId: f.faceId, neighbourId: h.faceId, similarity: h.similarity });
        }
      }
    }
    const clusters = buildClusters(allFaces, neighbours);
    clusters.forEach((c, idx) => c.members.forEach((m) => faceToCluster.set(m.faceId, idx)));

    // 3. Probe each enrolled person against the pool.
    const known = new Set(allFaces.map((f) => f.faceId));
    for (const person of ["person_1", "person_2"]) {
      const selfie = fs.readFileSync(firstImage(path.join(FIXTURES, "persons_photo", person)));
      const hits = await searchByImage(TEST_UID, selfie, 90);
      const recallNames = new Set(joinRekognitionMatches(hits, fileRows).map((m) => m.name));
      // High-confidence faces of this person, used for the cluster check.
      const faceIds = hits.filter((h) => h.similarity >= 92 && known.has(h.faceId)).map((h) => h.faceId);
      probes.set(person, { recallNames, faceIds });
    }
  });

  afterAll(async () => {
    await deleteCollection(TEST_UID).catch(() => undefined);
  });

  for (const person of ["person_1", "person_2"]) {
    it(`finds every ${person} photo listed in finial_data (recall)`, () => {
      const expected = listImages(path.join(FIXTURES, "finial_data", person));
      expect(expected.length).toBeGreaterThan(0);
      const matched = probes.get(person)!.recallNames;
      const missing = expected.filter((n) => !matched.has(n));
      expect({ person, missing }).toEqual({ person, missing: [] });
    });
  }

  it("consolidates each enrolled person into a single, distinct cluster", () => {
    const dominantCluster = (person: string): number => {
      const ids = probes.get(person)!.faceIds;
      expect(ids.length).toBeGreaterThan(0);
      const counts = new Map<number, number>();
      for (const id of ids) {
        const c = faceToCluster.get(id);
        if (c !== undefined) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      const [best, bestCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      // Allow at most one stray face in another cluster.
      expect(bestCount).toBeGreaterThanOrEqual(ids.length - 1);
      return best;
    };
    expect(dominantCluster("person_1")).not.toBe(dominantCluster("person_2"));
  });
});
