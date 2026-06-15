// REAL AWS Rekognition accuracy test over the facerec_examples fixtures.
//
// This is the Phase-1 empirical go/no-go: it proves that the live engine groups
// each person's selfie into exactly the wedding photos they appear in, and that
// clustering recovers the right number of people. It calls the real service, so:
//   - it needs AWS creds (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION)
//     and a region that supports Rekognition Collections,
//   - it costs a few cents per run,
//   - it is EXCLUDED from `test:unit` / CI and auto-skips without creds.
// Run with:  npm run test:rekognition
//
// Fixtures (repo root /facerec_examples):
//   photos_from_the_photographer/  — the input pool (all photos)
//   persons_photo/person_1|2/      — each person's enrollment selfie
//   finial_data/person_1|2/        — the expected grouping (filenames per person)

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
import { buildClusters, ClusterFace, Neighbour, CLUSTER_MIN_SIMILARITY } from "../../functions/src/faceIndex/cluster";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "..", "..", "..", "facerec_examples");

// Use a throwaway collection so a run never touches real wedding data.
process.env.REKOGNITION_COLLECTION_PREFIX = "dawatest";
const TEST_UID = `itest${Date.now()}`;

const IMG_RE = /\.(jpe?g|png)$/i;

function listImages(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => IMG_RE.test(n));
}

function firstImage(dir: string): string {
  const imgs = listImages(dir);
  if (!imgs.length) throw new Error(`no selfie image in ${dir}`);
  return path.join(dir, imgs[0]);
}

// Index-time state shared across the suite.
const fileRows: PhotoFileRow[] = []; // one per pool image (fileId = safe id)
const idToName = new Map<string, string>();
const allFaces: ClusterFace[] = [];

const run = isRekognitionConfigured();

describe.skipIf(!run)("Rekognition accuracy on facerec_examples", () => {
  beforeAll(async () => {
    await ensureCollection(TEST_UID);
    const poolDir = path.join(FIXTURES, "photos_from_the_photographer");
    const names = listImages(poolDir);
    expect(names.length).toBeGreaterThan(0);

    let i = 0;
    for (const name of names) {
      const fileId = `p${i++}`;
      idToName.set(fileId, name);
      fileRows.push({ fileId, name, url: `file://${name}`, type: "image/jpeg" });
      const buffer = fs.readFileSync(path.join(poolDir, name));
      const faces = await indexPhotoFaces(TEST_UID, fileId, buffer);
      for (const f of faces) {
        allFaces.push({ faceId: f.faceId, fileId, confidence: f.confidence, box: f.box });
      }
    }
    // We indexed at least one face per pool photo on average.
    expect(allFaces.length).toBeGreaterThanOrEqual(names.length);
  });

  afterAll(async () => {
    await deleteCollection(TEST_UID).catch(() => undefined);
  });

  for (const person of ["person_1", "person_2"]) {
    it(`matches ${person}'s selfie to exactly their finial_data photos`, async () => {
      const expected = new Set(listImages(path.join(FIXTURES, "finial_data", person)));
      expect(expected.size).toBeGreaterThan(0);

      const selfie = fs.readFileSync(firstImage(path.join(FIXTURES, "persons_photo", person)));
      const hits = await searchByImage(TEST_UID, selfie);
      const matched = new Set(joinRekognitionMatches(hits, fileRows).map((m) => m.name));

      // Recall: every expected photo is found. Precision: nothing extra.
      const missing = [...expected].filter((n) => !matched.has(n));
      const extra = [...matched].filter((n) => !expected.has(n));
      expect({ person, missing, extra }).toEqual({ person, missing: [], extra: [] });
    });
  }

  it("clusters the pool into exactly two people", async () => {
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
    expect(clusters).toHaveLength(2);

    // The two clusters' photo counts should match the two finial_data sets.
    const expectedCounts = ["person_1", "person_2"]
      .map((p) => listImages(path.join(FIXTURES, "finial_data", p)).length)
      .sort((a, b) => b - a);
    const gotCounts = clusters.map((c) => c.photoCount).sort((a, b) => b - a);
    expect(gotCounts).toEqual(expectedCounts);
  });
});
