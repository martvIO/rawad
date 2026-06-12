// One-off repair: stamp role="admin" custom claim on a user whose RTDB profile
// says role="admin" but whose Firebase Auth record has no matching claim.
// This happens when an account is created/migrated outside of createPortalUser.
//
// For broader migrations across every user, prefer functions/scripts/migrateClaims.js.
//
// Usage (against live Firebase — needs service-account key):
//   set GOOGLE_APPLICATION_CREDENTIALS=./dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json
//   set FIREBASE_DATABASE_URL=https://dawa-aa793-default-rtdb.firebaseio.com
//   set GCLOUD_PROJECT=dawa-aa793
//   node functions/scripts/fixAdminClaim.js <username>
//
// The script:
//   1. Looks up the Auth user by synthetic email (<username>@dawa.local)
//   2. Prints current custom claims so you can verify before writing
//   3. Sets admin: true on the Auth record
//   4. Ensures the RTDB profile has role: "admin"
const admin = require("firebase-admin");

const [username] = process.argv.slice(2);
if (!username) {
  console.error("Usage: node fixAdminClaim.js <username>");
  process.exit(1);
}

const databaseURL =
  process.env.VITE_FIREBASE_DATABASE_URL ||
  "https://dawa-aa793-default-rtdb.firebaseio.com";

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  "dawa-aa793";

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       process.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};
admin.initializeApp(firebaseConfig);

const email = `${username.toLowerCase()}@dawa.local`;

(async () => {
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (e) {
    console.error(`No Auth user found for ${email}:`, e.message);
    process.exit(1);
  }

  console.log(`Found user: ${userRecord.uid} (${userRecord.email})`);
  console.log("Current claims:", JSON.stringify(userRecord.customClaims ?? {}));

  if (userRecord.customClaims?.role === "admin") {
    console.log('role: "admin" is already set — nothing to do.');
    process.exit(0);
  }

  const existing = userRecord.customClaims ?? {};
  // Drop legacy admin:true if present.
  // eslint-disable-next-line no-unused-vars
  const { admin: _legacyAdmin, ...rest } = existing;
  const profileSnap = await admin.database().ref(`users/${userRecord.uid}/username`).get();
  const usernameClaim = rest.username
    ?? (profileSnap.exists() ? profileSnap.val() : userRecord.email.replace(/@.*/, ""));
  await admin.auth().setCustomUserClaims(userRecord.uid, {
    ...rest,
    role: "admin",
    username: usernameClaim,
  });
  console.log(`✓ Set role="admin", username="${usernameClaim}" on ${userRecord.uid}`);

  await admin.database().ref(`users/${userRecord.uid}/role`).set("admin");
  console.log("✓ Set role=admin in RTDB");

  console.log("\nDone. The user must sign out and sign back in to pick up the new claim.");
  process.exit(0);
})().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
