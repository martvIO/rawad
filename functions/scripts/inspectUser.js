// Diagnostic: look up an Auth user by username and print everything useful.
//
// Usage (against live Firebase — needs service-account key):
//   set GOOGLE_APPLICATION_CREDENTIALS=./dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json
//   set GCLOUD_PROJECT=dawa-aa793
//   node functions/scripts/inspectUser.js <username>
//
// Prints: existence, UID, email, disabled, custom claims, creation/last sign-in,
// and whether an /users/{uid} RTDB profile exists.
const admin = require("firebase-admin");

const [username] = process.argv.slice(2);
if (!username) {
  console.error("Usage: node inspectUser.js <username>");
  process.exit(1);
}

const databaseURL =
  process.env.VITE_FIREBASE_DATABASE_URL ||
  "https://dawa-aa793-default-rtdb.firebaseio.com";

admin.initializeApp({ databaseURL });

const email = `${username.toLowerCase()}@dawa.local`;

(async () => {
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      console.log(`✗ No Auth user for ${email}.`);
      console.log("  → That's why INVALID_LOGIN_CREDENTIALS — the account simply doesn't exist.");
      process.exit(2);
    }
    console.error("Auth lookup failed:", e);
    process.exit(1);
  }

  console.log("=== Firebase Auth record ===");
  console.log("  email           :", user.email);
  console.log("  uid             :", user.uid);
  console.log("  disabled        :", user.disabled);
  console.log("  emailVerified   :", user.emailVerified);
  console.log("  providerData    :", JSON.stringify(user.providerData.map(p => p.providerId)));
  console.log("  customClaims    :", JSON.stringify(user.customClaims ?? {}));
  console.log("  metadata        :", JSON.stringify(user.metadata, null, 2));

  console.log("\n=== RTDB profile (/users/" + user.uid + ") ===");
  const snap = await admin.database().ref(`users/${user.uid}`).get();
  if (!snap.exists()) {
    console.log("  ✗ No RTDB profile. Auth account is orphaned.");
  } else {
    console.log("  " + JSON.stringify(snap.val(), null, 2));
  }

  process.exit(0);
})().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
