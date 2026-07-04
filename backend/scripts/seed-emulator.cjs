// Seeds the running Firebase emulator suite with three portal accounts and a
// handful of guests. Run from a separate terminal once `npm run emulators` is
// up. Intended for local smoke-testing of the REST API; do NOT run against
// production credentials.
//
// Usage:
//   node scripts/seed-emulator.cjs
//
// Creates:
//   admin / Admin1234   (role: admin)
//   groom / Groom1234   (role: groom)
//   driver / Driver1234 (role: driver, assigned to the groom)
//
// All three sign in via the standard /auth/login endpoint after seeding.

// firebase-admin is installed under functions/node_modules; reuse it to avoid
// duplicating the package at the repo root.
const admin = require("../functions/node_modules/firebase-admin");

const PROJECT_ID = "dawa-aa793";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.GCLOUD_PROJECT = PROJECT_ID;

// Write to the SAME RTDB namespace the Cloud Functions read in the emulator —
// which namespace that is depends on the firebase-tools version: older CLIs
// advertise the LEGACY default instance in the runtime's FIREBASE_CONFIG
// (https://dawa-aa793.firebaseio.com → namespace "dawa-aa793"), newer CLIs the
// modern "<project>-default-rtdb". Seeding only one left the functions reading
// an empty namespace on the other CLI generation (guests list empty,
// confirmations "unknown_groom", etc. — this bit both directions, 2026-06-29
// and 2026-07-04). The app only ever touches RTDB through the Admin SDK (which
// bypasses security rules), so the namespace choice is purely about where data
// lives — seeding BOTH namespaces makes the seed CLI-version-proof.
admin.initializeApp({
  projectId: PROJECT_ID,
  databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}`,
});
const modernApp = admin.initializeApp(
  {
    projectId: PROJECT_ID,
    databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}-default-rtdb`,
  },
  "modern-ns",
);

const auth = admin.auth();
const rtdbs = [admin.database(), modernApp.database()];

// Apply each write to BOTH namespaces (see header). push() mints the key once
// so the two copies stay under identical paths.
const dbSet = (path, val) => Promise.all(rtdbs.map((db) => db.ref(path).set(val)));
const dbRemove = (path) => Promise.all(rtdbs.map((db) => db.ref(path).remove()));
const dbPush = async (path, val) => {
  const key = rtdbs[0].ref(path).push().key;
  await dbSet(`${path}/${key}`, val);
  return key;
};

const USERS = [
  { username: "admin", password: "Admin1234", role: "admin", displayName: "Test Admin", phone: "+972500000001" },
  { username: "groom", password: "Groom1234", role: "groom", displayName: "Test Groom", phone: "+972500000002" },
  { username: "driver", password: "Driver1234", role: "driver", displayName: "Test Driver", phone: "+972500000003" },
];

// Field names match what the app reads (src/pages/portal/groom/GroomGuests.jsx
// and DriverDeliveryList.jsx): name / phone / area / status / inviteType.
// groomUsername must be set so AdminSendTab's filter (`g.groomUsername === …`)
// picks them up.
const GUESTS = [
  { name: "Ahmad Test",  phone: "+972501111111", area: "Haifa, Main St, 12",  status: "pending", inviteType: "premium" },
  { name: "Fatima Test", phone: "+972502222222", area: "Nazareth, Hill Rd, 5", status: "pending", inviteType: "premium" },
];

async function ensureUser({ username, password, role, displayName, phone }) {
  const email = `${username}@dawa.local`;
  let user;
  try {
    user = await auth.getUserByEmail(email);
    // Force-sync the password so reseeding never strands tests on a stale
    // credential set. phoneNumber/displayName updates are safe-no-op if
    // unchanged.
    await auth.updateUser(user.uid, { password, displayName, phoneNumber: phone });
    console.log(`[seed] exists: ${username} (${user.uid}) — password resynced`);
  } catch {
    user = await auth.createUser({ email, password, displayName, phoneNumber: phone });
    console.log(`[seed] created: ${username} (${user.uid})`);
  }
  await auth.setCustomUserClaims(user.uid, { role, username });
  await dbSet(`users/${user.uid}`, {
    username, role, displayName, phoneE164: phone, createdAt: Date.now(),
  });
  await dbSet(`usernameIndex/${username}`, user.uid);
  // Mirror production userStore: phoneIndex is written in lock-step with
  // usernameIndex. The phone-OTP password reset (/auth/reset-password) resolves
  // the account via phoneIndex/{digits}, so without this the reset 404s.
  await dbSet(`phoneIndex/${phone.replace(/^\+/, "")}`, user.uid);
  return user.uid;
}

async function seedGroomProfile(uid, username, displayName) {
  await dbSet(`groomProfiles/${uid}`, { username, displayName });
}

async function seedGuests(groomUid, groomUsername) {
  // Clear any prior seeded guests so reseeding is idempotent (avoids
  // accumulating duplicates across emulator restarts).
  await dbRemove(`guestsByGroom/${groomUid}`);
  for (const g of GUESTS) {
    const key = await dbPush(`guestsByGroom/${groomUid}`, {
      ...g,
      groomUid,
      groomUsername,
      createdAt: Date.now(),
    });
    console.log(`[seed] guest: ${g.name} -> ${key}`);
  }
}

async function assignDriver(driverUid, groomUid) {
  const driver = await auth.getUser(driverUid);
  const claims = driver.customClaims || {};
  const next = {
    ...claims,
    role: "driver",
    assignedGrooms: { ...(claims.assignedGrooms || {}), [groomUid]: true },
  };
  await auth.setCustomUserClaims(driverUid, next);
  await dbSet(`driverAssignments/${driverUid}/${groomUid}`, true);
  console.log(`[seed] assigned driver ${driverUid} -> groom ${groomUid}`);
}

async function seedAdminSettings() {
  await dbSet("adminSettings", {
    messageBody: "Dear {name}, you are invited!",
    formLink: "/confirm/groom",
  });
}

(async () => {
  try {
    const uids = {};
    for (const u of USERS) uids[u.username] = await ensureUser(u);
    await seedGroomProfile(uids.groom, "groom", "Test Groom");
    await seedGuests(uids.groom, "groom");
    await assignDriver(uids.driver, uids.groom);
    await seedAdminSettings();
    console.log("[seed] done.");
    console.log("\nLogin via /api/auth/login:");
    USERS.forEach(u => console.log(`  ${u.username} / ${u.password}`));
    process.exit(0);
  } catch (err) {
    console.error("[seed] FAILED:", err);
    process.exit(1);
  }
})();
