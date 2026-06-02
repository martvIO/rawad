// One-shot backfill: mirror every ATTENDING digital-invite guest
// (Firestore digitalInvitations/{groomUid}/guests/*) into RTDB
// /confirmations/dg_{guestId}, so digital RSVPs submitted before the
// live mirror existed also show on the admin Confirmations page.
//
// Idempotent: deterministic dg_{guestId} keys → re-runs upsert, no duplicates.
//
// Usage:
//   node scripts/backfill-digital-confirmations.cjs           # dry-run (no writes)
//   node scripts/backfill-digital-confirmations.cjs --apply   # actually write
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
const key = require(path.join(__dirname, "..", "dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json"));

admin.initializeApp({
  credential: admin.credential.cert(key),
  projectId: "dawa-aa793",
  databaseURL: "https://dawa-aa793-default-rtdb.firebaseio.com",
});
const fs = admin.firestore();
const rtdb = admin.database();

const APPLY = process.argv.includes("--apply");

(async () => {
  // Build uid -> username from RTDB /users (single source of truth).
  const usersSnap = await rtdb.ref("users").get();
  const users = usersSnap.val() || {};
  const uidToUsername = {};
  for (const [uid, u] of Object.entries(users)) if (u && u.username) uidToUsername[uid] = u.username;

  const parents = await fs.collection("digitalInvitations").listDocuments();
  let found = 0, written = 0;
  for (const parent of parents) {
    const groomUid = parent.id;
    const guestsSnap = await parent.collection("guests").get();
    for (const g of guestsSnap.docs) {
      const data = g.data() || {};
      if (data.status !== "attending") continue;
      found++;
      const record = {
        groomUid,
        groomUsername: uidToUsername[groomUid] || "",
        submittedName: (data.name || "").toString(),
        submittedPhone: (data.phone || "").toString(),
        confirmedAt: Number(data.confirmedAt) || Date.now(),
        source: "digital",
        attachedGuestId: g.id,
      };
      if (typeof data.companions === "number") record.companions = data.companions;
      const total = (record.companions || 0) + 1;
      console.log(`${APPLY ? "WRITE" : "DRY "} dg_${g.id}  "${record.submittedName}" (groom ${record.groomUsername || "?"}) total=${total}`);
      if (APPLY) { await rtdb.ref(`confirmations/dg_${g.id}`).set(record); written++; }
    }
  }
  console.log(`\nattending digital guests: ${found}; ${APPLY ? `written: ${written}` : "dry-run only — use --apply to write"}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
