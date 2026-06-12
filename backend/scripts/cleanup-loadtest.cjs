// Deletes ONLY load-test data (records whose marker fields start with the
// literal "LOADTEST") from RTDB + Firestore, using the Firebase Admin SDK.
// Mirrors the DELETE /api/admin/loadtest-data endpoint so the dashboard can
// clean up either via the API (live functions) or via this script (direct DB).
//
// SAFETY — this script NEVER wipes whole nodes / collections. Every delete is
// gated on a marker check; a record without the "LOADTEST" marker is left
// untouched. In production it REFUSES to delete unless you pass --yes (it
// prints a dry-run table instead).
//
// Usage:
//   # Emulator (RTDB :9000, Firestore :8080, Auth :9099):
//   node backend/scripts/cleanup-loadtest.cjs --emulator [--groom-username groom] [--dry-run]
//   node backend/scripts/cleanup-loadtest.cjs --emulator --groom-uid <uid>
//
//   # Production (requires GOOGLE_APPLICATION_CREDENTIALS pointing at the
//   # repo-root service-account key, e.g.
//   #   export GOOGLE_APPLICATION_CREDENTIALS=./dawa-aa793-firebase-adminsdk-*.json
//   # The key is gitignored — do NOT hardcode or stage it.):
//   node backend/scripts/cleanup-loadtest.cjs --groom-uid <uid> --yes
//   node backend/scripts/cleanup-loadtest.cjs --groom-username groom --yes
//
// Flags:
//   --emulator             use the local emulator suite (no credentials needed)
//   --groom-uid <uid>      scope Firestore guest/wish deletes to one groom
//   --groom-username <u>   resolve the groom uid via RTDB usernameIndex/{u}
//   --yes                  required in production to actually delete
//   --dry-run              list matches, delete nothing (allowed anywhere)
//
// Deletes the SAME four sets as the endpoint:
//   a) RTDB /confirmations/{id}  where submittedName startsWith "LOADTEST"
//      OR submittedCity === "LOADTEST"
//   b) RTDB /inviteTokens/{token} where guestName startsWith "LOADTEST"
//   c) Firestore digitalInvitations/{groomUid}/guests where name startsWith "LOADTEST"
//   d) Firestore digitalInvitations/{groomUid}/wishes where who OR what startsWith "LOADTEST"

// firebase-admin is installed under functions/node_modules; reuse it to avoid
// duplicating the package at the repo root (same pattern as seed-emulator.cjs).
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));

const PROJECT_ID = "dawa-aa793";
const PROD_DATABASE_URL = "https://dawa-aa793-default-rtdb.firebaseio.com";

const LOADTEST_MARKER = "LOADTEST";
// `` is a very high private-use code point; "LOADTEST" .. "LOADTEST" is
// the inclusive/exclusive range that selects every "LOADTEST*" string.
const LOADTEST_RANGE_END = `${LOADTEST_MARKER}`;

const COLL_ROOT = "digitalInvitations";
const COLL_GUESTS = "guests";
const COLL_WISHES = "wishes";
const FIRESTORE_BATCH_LIMIT = 450;

// ─── Arg parsing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { emulator: false, dryRun: false, yes: false, groomUid: null, groomUsername: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--emulator") args.emulator = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--yes") args.yes = true;
    else if (a === "--groom-uid") args.groomUid = argv[++i];
    else if (a === "--groom-username") args.groomUsername = argv[++i];
  }
  return args;
}

const ARGS = parseArgs(process.argv.slice(2));

// ─── Admin SDK init ─────────────────────────────────────────────────────────

if (ARGS.emulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  admin.initializeApp({
    projectId: PROJECT_ID,
    databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}-default-rtdb`,
  });
} else {
  // Production: relies on GOOGLE_APPLICATION_CREDENTIALS (the gitignored
  // repo-root service-account key) for credentials — never hardcoded here.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "[cleanup] ERROR: production mode requires GOOGLE_APPLICATION_CREDENTIALS " +
        "pointing at the repo-root service-account key (the key is gitignored). " +
        "Or pass --emulator to target the local emulator suite."
    );
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
    databaseURL: PROD_DATABASE_URL,
  });
}

const rtdb = admin.database();
const fs = admin.firestore();

// ─── Marker matchers ────────────────────────────────────────────────────────

const startsWithMarker = (v) => String(v == null ? "" : v).startsWith(LOADTEST_MARKER);

// ─── Step (a): RTDB /confirmations ──────────────────────────────────────────

async function findConfirmations() {
  const snap = await rtdb.ref("confirmations").get();
  const matches = [];
  if (!snap.exists()) return matches;
  snap.forEach((child) => {
    const v = child.val() || {};
    if (startsWithMarker(v.submittedName) || v.submittedCity === LOADTEST_MARKER) {
      matches.push({ id: child.key, label: String(v.submittedName ?? "(no name)") });
    }
  });
  return matches;
}

// ─── Step (b): RTDB /inviteTokens ───────────────────────────────────────────

async function findInviteTokens() {
  const snap = await rtdb.ref("inviteTokens").get();
  const matches = [];
  if (!snap.exists()) return matches;
  snap.forEach((child) => {
    const v = child.val() || {};
    if (startsWithMarker(v.guestName)) {
      matches.push({ id: child.key, label: String(v.guestName ?? "(no name)") });
    }
  });
  return matches;
}

// ─── Step (c): Firestore guests ─────────────────────────────────────────────

async function findGuests(groomUid) {
  if (!groomUid) return [];
  const snap = await fs
    .collection(`${COLL_ROOT}/${groomUid}/${COLL_GUESTS}`)
    .where("name", ">=", LOADTEST_MARKER)
    .where("name", "<", LOADTEST_RANGE_END)
    .get();
  return snap.docs.map((d) => ({ ref: d.ref, id: d.id, label: String(d.data().name ?? "(no name)") }));
}

// ─── Step (d): Firestore wishes ─────────────────────────────────────────────

async function findWishes(groomUid) {
  if (!groomUid) return [];
  const snap = await fs.collection(`${COLL_ROOT}/${groomUid}/${COLL_WISHES}`).get();
  return snap.docs
    .filter((d) => {
      const data = d.data() || {};
      return startsWithMarker(data.who) || startsWithMarker(data.what);
    })
    .map((d) => ({ ref: d.ref, id: d.id, label: String(d.data().who ?? "(no who)") }));
}

// ─── Deleters ───────────────────────────────────────────────────────────────

async function deleteRtdbByPath(prefix, matches) {
  if (matches.length === 0) return 0;
  const updates = {};
  for (const m of matches) updates[`${prefix}/${m.id}`] = null;
  await rtdb.ref().update(updates);
  return matches.length;
}

async function deleteFirestoreDocs(matches) {
  let deleted = 0;
  for (let i = 0; i < matches.length; i += FIRESTORE_BATCH_LIMIT) {
    const slice = matches.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = fs.batch();
    for (const m of slice) batch.delete(m.ref);
    await batch.commit();
    deleted += slice.length;
  }
  return deleted;
}

// ─── Groom-uid resolution ───────────────────────────────────────────────────

async function resolveGroomUid() {
  if (ARGS.groomUid) return ARGS.groomUid;
  if (ARGS.groomUsername) {
    const snap = await rtdb.ref(`usernameIndex/${ARGS.groomUsername}`).get();
    if (!snap.exists()) {
      console.error(`[cleanup] ERROR: no usernameIndex entry for "${ARGS.groomUsername}"`);
      process.exit(1);
    }
    return snap.val();
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const groomUid = await resolveGroomUid();
  const mode = ARGS.emulator ? "EMULATOR" : "PRODUCTION";
  // Production deletes require an explicit --yes; without it we force a dry run.
  const willDelete = !ARGS.dryRun && (ARGS.emulator || ARGS.yes);
  const effectiveDryRun = !willDelete;

  console.log(`[cleanup] mode=${mode} groomUid=${groomUid || "(none)"} ${effectiveDryRun ? "DRY-RUN" : "DELETE"}`);
  if (!ARGS.emulator && !ARGS.yes && !ARGS.dryRun) {
    console.log("[cleanup] production refuses to delete without --yes — showing dry-run table instead.\n");
  }

  const confirmations = await findConfirmations();
  const inviteTokens = await findInviteTokens();
  const guests = await findGuests(groomUid);
  const wishes = await findWishes(groomUid);

  const report = (title, matches) => {
    console.log(`\n${title}: ${matches.length} match(es)`);
    for (const m of matches) console.log(`  - ${m.id}  "${m.label}"`);
  };
  report("confirmations (RTDB)", confirmations);
  report("inviteTokens (RTDB)", inviteTokens);
  if (groomUid) {
    report(`guests (Firestore ${COLL_ROOT}/${groomUid}/${COLL_GUESTS})`, guests);
    report(`wishes (Firestore ${COLL_ROOT}/${groomUid}/${COLL_WISHES})`, wishes);
  } else {
    console.log("\nguests/wishes (Firestore): skipped — no --groom-uid / --groom-username provided");
  }

  if (effectiveDryRun) {
    console.log("\n[cleanup] dry-run only — nothing deleted.");
    process.exit(0);
  }

  const deleted = {
    confirmations: await deleteRtdbByPath("confirmations", confirmations),
    inviteTokens: await deleteRtdbByPath("inviteTokens", inviteTokens),
    guests: groomUid ? await deleteFirestoreDocs(guests) : 0,
    wishes: groomUid ? await deleteFirestoreDocs(wishes) : 0,
  };

  console.log(
    `\n[cleanup] deleted — confirmations:${deleted.confirmations} ` +
      `inviteTokens:${deleted.inviteTokens} guests:${deleted.guests} wishes:${deleted.wishes}`
  );
  process.exit(0);
})().catch((err) => {
  console.error("[cleanup] FAILED:", err);
  process.exit(1);
});
