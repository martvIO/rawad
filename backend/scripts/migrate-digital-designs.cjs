// One-shot migration: lift each groom's single design (v1, on the parent doc)
// into a `designs/{autoId}` subcollection doc (v2). Idempotent + NON-destructive
// (parent design fields are left in place; new reads ignore them). Mirrors
// ensureMigrated() in functions/src/api/routes/digital.ts.
//
// Usage:
//   node scripts/migrate-digital-designs.cjs           # dry-run (no writes)
//   node scripts/migrate-digital-designs.cjs --apply   # actually migrate
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
const key = require(path.join(__dirname, "..", "..", "dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json"));

admin.initializeApp({ credential: admin.credential.cert(key), projectId: "dawa-aa793" });
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");
const SCHEMA_VERSION = 2;
const PARENT_ONLY = new Set([
  "photographerPublished", "guestRanks", "schemaVersion", "defaultDesignId", "designCount",
]);

function projectMediaDoc(data) {
  if (!data) return {};
  if (Array.isArray(data.media) && data.media.length > 0) return data;
  if (data.backgroundUrl) {
    const kind = data.backgroundType === "video" ? "video" : data.backgroundType === "gif" ? "gif" : "image";
    return { ...data, media: [{ url: data.backgroundUrl, kind, storagePath: data.storagePath || "", order: 0 }] };
  }
  return data;
}

(async () => {
  const snap = await db.collection("digitalInvitations").get();
  let migrated = 0, skipped = 0;
  console.log(`Found ${snap.size} groom invitation docs. APPLY=${APPLY}`);
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.schemaVersion === SCHEMA_VERSION && data.defaultDesignId) {
      skipped++;
      continue;
    }
    const status = data.designStatus || "draft";
    console.log(`  ${APPLY ? "migrating" : "[dry] would migrate"} ${doc.id}  (designStatus=${status})`);
    if (!APPLY) { migrated++; continue; }
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const d = fresh.exists ? fresh.data() : {};
      if (d.schemaVersion === SCHEMA_VERSION && d.defaultDesignId) return;
      const designRef = doc.ref.collection("designs").doc();
      const legacy = projectMediaDoc(d);
      const payload = {};
      for (const [k, v] of Object.entries(legacy)) if (!PARENT_ONLY.has(k)) payload[k] = v;
      if (!payload.title) payload.title = { ar: "التصميم الأساسي", he: "עיצוב ראשי" };
      payload.order = 0;
      if (payload.createdAt == null) payload.createdAt = Date.now();
      if (payload.designStatus == null) payload.designStatus = "draft";
      if (payload.designVersion == null) payload.designVersion = 1;
      tx.set(designRef, payload);
      tx.set(doc.ref, { schemaVersion: SCHEMA_VERSION, defaultDesignId: designRef.id, designCount: 1 }, { merge: true });
    });
    migrated++;
  }
  console.log(`Done. ${APPLY ? "migrated" : "would-migrate"}=${migrated} skipped=${skipped} total=${snap.size}`);
  process.exit(0);
})().catch((e) => { console.error("ERR", e && e.message ? e.message : e); process.exit(1); });
