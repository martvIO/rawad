// One-shot backfill: stamp {role, username} on every existing Auth user's
// custom claims, derived from their /users/{uid} RTDB profile. Strips the
// legacy `admin: true` field. Preserves `assignedGrooms` for drivers.
//
// Usage (against live Firebase — needs service-account key):
//   set GOOGLE_APPLICATION_CREDENTIALS=./dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json
//   set GCLOUD_PROJECT=dawa-aa793
//   node functions/scripts/migrateClaims.js          # backfill only
//   node functions/scripts/migrateClaims.js --revoke # also force a refresh
//                                                    # for every signed-in user
//   node functions/scripts/migrateClaims.js --dry    # just print, don't write
const admin = require("firebase-admin");

const args = process.argv.slice(2);
const REVOKE = args.includes("--revoke");
const DRY    = args.includes("--dry");

const databaseURL =
  process.env.VITE_FIREBASE_DATABASE_URL ||
  "https://dawa-aa793-default-rtdb.firebaseio.com";

admin.initializeApp({ databaseURL });

async function listAllUsers() {
  const out = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    out.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

(async () => {
  const users = await listAllUsers();
  console.log(`Found ${users.length} Auth users.`);

  let migrated = 0, skipped = 0, missingProfile = 0;
  for (const u of users) {
    const profileSnap = await admin.database().ref(`users/${u.uid}`).get();
    if (!profileSnap.exists()) {
      console.log(`  [-] ${u.uid} (${u.email}) — no RTDB profile, skipping`);
      missingProfile++;
      continue;
    }
    const profile = profileSnap.val();
    const role = profile.role;
    const username = profile.username;
    if (!role || !username) {
      console.log(`  [-] ${u.uid} — profile missing role/username, skipping`);
      skipped++;
      continue;
    }
    const existing = u.customClaims ?? {};
    // Drop legacy admin flag; keep everything else (notably assignedGrooms).
    // eslint-disable-next-line no-unused-vars
    const { admin: _legacyAdmin, ...rest } = existing;
    const next = { ...rest, role, username };
    if (
      existing.role === role &&
      existing.username === username &&
      existing.admin === undefined
    ) {
      console.log(`  [=] ${u.uid} (${username}, ${role}) — already migrated`);
      skipped++;
      continue;
    }
    if (DRY) {
      console.log(`  [+] ${u.uid} (${username}, ${role}) — would set`, next);
    } else {
      await admin.auth().setCustomUserClaims(u.uid, next);
      if (REVOKE) await admin.auth().revokeRefreshTokens(u.uid);
      console.log(`  [+] ${u.uid} (${username}, ${role}) — migrated${REVOKE ? " + revoked" : ""}`);
    }
    migrated++;
  }

  console.log("\n=== Summary ===");
  console.log(`  migrated:        ${migrated}`);
  console.log(`  already-correct: ${skipped}`);
  console.log(`  missing profile: ${missingProfile}`);
  if (DRY) console.log("\n(dry-run — no writes were performed)");
  process.exit(0);
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
