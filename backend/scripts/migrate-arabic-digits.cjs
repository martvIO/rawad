// One-time migration: rewrite Arabic-Indic (٠-٩) and Extended Arabic-Indic /
// Persian (۰-۹) digits to Western ASCII digits across the whole database
// (Realtime Database + Firestore). The product standard is Western digits
// everywhere; this script scrubs data that was stored before the input-layer
// normalization (src/utils/digits.js) was in place.
//
// SAFETY MODEL
//   - Read-only DRY RUN by default. It prints every change it WOULD make and
//     exits without writing anything.
//   - Pass --commit to actually write the changes.
//   - Targets the local EMULATOR by default. Pass --prod to target production
//     (requires GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account
//     key, or `gcloud auth application-default login`).
//
// USAGE
//   # Dry run against the running emulator suite:
//   node scripts/migrate-arabic-digits.cjs
//
//   # Apply to the emulator:
//   node scripts/migrate-arabic-digits.cjs --commit
//
//   # Dry run against PRODUCTION (read-only, safe to inspect first):
//   GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json \
//     node scripts/migrate-arabic-digits.cjs --prod
//
//   # Apply to PRODUCTION (irreversible — back up first):
//   GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json \
//     node scripts/migrate-arabic-digits.cjs --prod --commit
//
// FLAGS
//   --commit           Write changes (default: dry run).
//   --prod             Target production (default: emulator).
//   --rtdb-only        Only migrate Realtime Database.
//   --firestore-only   Only migrate Firestore.
//   --db-url=<url>     Override the RTDB databaseURL.

const path = require("path");
const { pathToFileURL } = require("url");

// firebase-admin lives under functions/node_modules (same as seed-emulator.cjs).
const admin = require("../functions/node_modules/firebase-admin");

const PROJECT_ID = "dawa-aa793";

const args = new Set(process.argv.slice(2));
const COMMIT = args.has("--commit");
const PROD = args.has("--prod");
const RTDB_ONLY = args.has("--rtdb-only");
const FIRESTORE_ONLY = args.has("--firestore-only");
const dbUrlArg = process.argv.slice(2).find((a) => a.startsWith("--db-url="));
const DB_URL_OVERRIDE = dbUrlArg ? dbUrlArg.split("=")[1] : null;

// ── Conversion (single-sourced from the app util so the digit map can't drift)
let toWesternDigits;

// Recursively convert strings; never recurse into non-plain objects (e.g.
// Firestore Timestamp / GeoPoint / DocumentReference) so their types survive.
function isPlainObject(v) {
  return v && typeof v === "object" && (v.constructor === Object || v.constructor === undefined);
}

// Walk `value`, returning the converted clone plus the list of {path, from, to}
// leaf changes (path relative to the caller-supplied prefix).
function convert(value, prefix, changes) {
  if (typeof value === "string") {
    const next = toWesternDigits(value);
    if (next !== value) changes.push({ path: prefix, from: value, to: next });
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => convert(v, `${prefix}[${i}]`, changes));
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = convert(v, prefix ? `${prefix}/${k}` : k, changes);
    }
    return out;
  }
  return value; // number, boolean, null, Timestamp, GeoPoint, Bytes, …
}

// ── Realtime Database ───────────────────────────────────────────────────────

async function migrateRtdb(rtdb) {
  console.log("\n=== Realtime Database ===");
  const snap = await rtdb.ref("/").once("value");
  const root = snap.val();
  if (!root) {
    console.log("  (database is empty)");
    return { changed: 0 };
  }

  // Build a flat map of changed leaf paths so we can update surgically rather
  // than rewriting whole subtrees (avoids clobbering concurrent writes).
  const changes = [];
  convert(root, "", changes);

  if (changes.length === 0) {
    console.log("  No Arabic-Indic digits found. Nothing to do.");
    return { changed: 0 };
  }

  console.log(`  Found ${changes.length} string value(s) to convert:`);
  for (const c of changes.slice(0, 50)) {
    console.log(`    ${c.path}\n      "${c.from}" → "${c.to}"`);
  }
  if (changes.length > 50) console.log(`    … and ${changes.length - 50} more.`);

  if (!COMMIT) return { changed: changes.length };

  // Apply in chunks of 200 deep paths per multi-location update.
  const updates = {};
  changes.forEach((c) => { updates[c.path] = c.to; });
  const entries = Object.entries(updates);
  for (let i = 0; i < entries.length; i += 200) {
    const batch = Object.fromEntries(entries.slice(i, i + 200));
    await rtdb.ref("/").update(batch);
    console.log(`  Wrote ${Math.min(i + 200, entries.length)}/${entries.length} paths…`);
  }
  console.log("  RTDB migration committed.");
  return { changed: changes.length };
}

// ── Firestore ───────────────────────────────────────────────────────────────

async function migrateCollection(collRef, stats) {
  const snap = await collRef.get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const changes = [];
    const converted = convert(data, "", changes);
    if (changes.length > 0) {
      stats.changed += changes.length;
      console.log(`  ${doc.ref.path}`);
      for (const c of changes.slice(0, 20)) {
        console.log(`    ${c.path}: "${c.from}" → "${c.to}"`);
      }
      if (changes.length > 20) console.log(`    … and ${changes.length - 20} more.`);
      if (COMMIT) await doc.ref.set(converted, { merge: false });
    }
    // Recurse into subcollections.
    const subs = await doc.ref.listCollections();
    for (const sub of subs) await migrateCollection(sub, stats);
  }
}

async function migrateFirestore(firestore) {
  console.log("\n=== Firestore ===");
  const stats = { changed: 0 };
  const roots = await firestore.listCollections();
  if (roots.length === 0) {
    console.log("  (no collections)");
    return stats;
  }
  for (const coll of roots) await migrateCollection(coll, stats);
  if (stats.changed === 0) console.log("  No Arabic-Indic digits found. Nothing to do.");
  else if (COMMIT) console.log("  Firestore migration committed.");
  return stats;
}

// ── Entry ─────────────────────────────────────────────────────────────────

(async () => {
  ({ toWesternDigits } = await import(
    pathToFileURL(path.join(__dirname, "..", "..", "frontend", "src", "utils", "digits.js")).href
  ));

  if (PROD) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.warn(
        "[warn] --prod set but GOOGLE_APPLICATION_CREDENTIALS is not set. " +
        "Relying on application-default credentials (gcloud auth application-default login)."
      );
    }
    admin.initializeApp({
      projectId: PROJECT_ID,
      credential: admin.credential.applicationDefault(),
      databaseURL: DB_URL_OVERRIDE || `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
    });
  } else {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= "127.0.0.1:9000";
    process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    admin.initializeApp({
      projectId: PROJECT_ID,
      databaseURL: DB_URL_OVERRIDE || `http://127.0.0.1:9000/?ns=${PROJECT_ID}-default-rtdb`,
    });
  }

  console.log("Arabic-Indic → Western digit migration");
  console.log(`  Target : ${PROD ? "PRODUCTION" : "EMULATOR"}`);
  console.log(`  Mode   : ${COMMIT ? "COMMIT (writing changes)" : "DRY RUN (no writes)"}`);

  let total = 0;
  if (!FIRESTORE_ONLY) total += (await migrateRtdb(admin.database())).changed;
  if (!RTDB_ONLY) total += (await migrateFirestore(admin.firestore())).changed;

  console.log(`\nDone. ${total} value(s) ${COMMIT ? "converted" : "would be converted"}.`);
  if (total > 0 && !COMMIT) console.log("Re-run with --commit to apply.");
  process.exit(0);
})().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
