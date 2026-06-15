// One-off diagnostic: measure Rekognition face-to-face similarity on the
// facerec_examples pool and report how many clusters form at each threshold.
// Run from backend/functions:  node scripts/rek-diagnose.cjs
// Reads AWS creds from backend/functions/.env.local. Cleans up its collection.
const fs = require("fs");
const path = require("path");
const {
  RekognitionClient,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  SearchFacesCommand,
} = require("@aws-sdk/client-rekognition");

// ── load .env.local ───────────────────────────────────────────────────────────
const envFile = path.resolve(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}

const POOL = path.resolve(__dirname, "..", "..", "..", "facerec_examples", "photos_from_the_photographer");
const COLLECTION = `dawatest_diag_${Date.now()}`;
const client = new RekognitionClient({ region: process.env.AWS_REGION });

class UF {
  constructor() { this.p = new Map(); }
  add(x) { if (!this.p.has(x)) this.p.set(x, x); }
  find(x) { while (this.p.get(x) !== x) { this.p.set(x, this.p.get(this.p.get(x))); x = this.p.get(x); } return x; }
  union(a, b) { this.add(a); this.add(b); this.p.set(this.find(a), this.find(b)); }
}

function components(faceIds, edges, threshold) {
  const uf = new UF();
  for (const id of faceIds) uf.add(id);
  for (const e of edges) if (e.sim >= threshold) uf.union(e.a, e.b);
  return new Set(faceIds.map((id) => uf.find(id))).size;
}

(async () => {
  await client.send(new CreateCollectionCommand({ CollectionId: COLLECTION }));
  try {
    const names = fs.readdirSync(POOL).filter((n) => /\.(jpe?g|png)$/i.test(n));
    const faceToFile = new Map(); // faceId -> filename
    const facesPerPhoto = [];

    let i = 0;
    for (const name of names) {
      const bytes = fs.readFileSync(path.join(POOL, name));
      const out = await client.send(new IndexFacesCommand({
        CollectionId: COLLECTION,
        Image: { Bytes: bytes },
        ExternalImageId: `p${i}`,
        QualityFilter: "AUTO",
        MaxFaces: 50,
        DetectionAttributes: [],
      }));
      const recs = (out.FaceRecords || []).filter((r) => r.Face && r.Face.FaceId);
      for (const r of recs) faceToFile.set(r.Face.FaceId, name);
      facesPerPhoto.push({ name, faces: recs.length, unindexed: (out.UnindexedFaces || []).length });
      i++;
    }

    const faceIds = [...faceToFile.keys()];
    console.log(`\nphotos: ${names.length}, total indexed faces: ${faceIds.length}`);
    console.log("faces per photo:");
    for (const f of facesPerPhoto) console.log(`  ${f.faces} (unindexed ${f.unindexed})  ${f.name}`);

    // Collect all edges with their similarity via a low-threshold SearchFaces.
    const edges = [];
    let crossMin = 100, sameMax = 0, sameMin = 100;
    for (const id of faceIds) {
      const out = await client.send(new SearchFacesCommand({
        CollectionId: COLLECTION, FaceId: id, FaceMatchThreshold: 1, MaxFaces: 50,
      }));
      for (const m of out.FaceMatches || []) {
        const other = m.Face && m.Face.FaceId;
        if (!other || other === id) continue;
        edges.push({ a: id, b: other, sim: m.Similarity });
      }
    }

    for (const thr of [99, 97, 95, 92, 90, 88, 85, 80, 75, 70, 60]) {
      console.log(`  threshold ${String(thr).padStart(2)} -> ${components(faceIds, edges, thr)} clusters`);
    }

    // Similarity histogram (max per ordered pair) to eyeball the gap.
    const buckets = {};
    for (const e of edges) {
      const b = Math.floor(e.sim / 5) * 5;
      buckets[b] = (buckets[b] || 0) + 1;
    }
    console.log("similarity histogram (edge count by 5-pt bucket):");
    for (const b of Object.keys(buckets).map(Number).sort((x, y) => x - y)) {
      console.log(`  ${b}-${b + 5}: ${buckets[b]}`);
    }
  } finally {
    await client.send(new DeleteCollectionCommand({ CollectionId: COLLECTION }));
    console.log(`\ndeleted ${COLLECTION}`);
  }
})().catch((e) => { console.error("DIAG ERROR", e); process.exit(1); });
