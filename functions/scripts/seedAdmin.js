// One-off bootstrap: creates the first admin portal user.
//
// Run against the local emulator (emulators must already be running):
//   set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
//   set FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000
//   set GCLOUD_PROJECT=dawa-aa793
//   node functions/scripts/seedAdmin.js admin StrongPass123 +972500000000
//
// Or let firebase-tools manage env vars automatically:
//   firebase emulators:exec --only auth,database --project dawa-aa793 "node functions/scripts/seedAdmin.js admin StrongPass123 +972500000000"
//
// Run against a real project (requires GOOGLE_APPLICATION_CREDENTIALS pointing
// to a service-account JSON for that project):
//   set GOOGLE_APPLICATION_CREDENTIALS=./key.json
//   set FIREBASE_DATABASE_URL=https://dawa-aa793-default-rtdb.firebaseio.com
//   set GCLOUD_PROJECT=dawa-aa793
//   node functions/scripts/seedAdmin.js admin StrongPass123 +972500000000
const admin = require("firebase-admin");

const [username, password, phoneE164] = process.argv.slice(2);
if (!username || !password || !phoneE164) {
  console.error("Usage: node seedAdmin.js <username> <password> <phoneE164>");
  process.exit(1);
}
if (!/^[a-zA-Z0-9_.-]{2,60}$/.test(username)) {
  console.error("Invalid username");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}
if (!/^\+[1-9][0-9]{6,14}$/.test(phoneE164)) {
  console.error("Phone must be in E.164 format, e.g. +972501234567");
  process.exit(1);
}

const dbEmulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";

const databaseURL =
  process.env.FIREBASE_DATABASE_URL ||
  process.env.VITE_FIREBASE_DATABASE_URL ||
  `http://${dbEmulatorHost}?ns=dawa-aa793-default-rtdb`;

// The Admin SDK cannot auto-detect project ID outside GCP (no metadata server).
// Read it from the standard env vars firebase-tools sets, or fall back to the
// project ID embedded in the database URL.
const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  (() => {
    // Extract from https://<id>-default-rtdb.firebaseio.com or ns=<id>-default-rtdb
    const m = databaseURL.match(/ns=([^&]+)/) || databaseURL.match(/\/\/([^.]+)\./);
    const ns = m ? m[1] : null;
    return ns ? ns.replace(/-default-rtdb$/, "") : null;
  })();

if (!projectId) {
  console.error(
    "Cannot determine project ID. Set GCLOUD_PROJECT or FIREBASE_DATABASE_URL."
  );
  process.exit(1);
}

admin.initializeApp({ databaseURL, projectId });

const email = `${username.toLowerCase()}@dawa.local`;
const phoneIdx = phoneE164.replace(/\D/g, "");

(async () => {
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email, password, phoneNumber: phoneE164, displayName: username,
    });
    console.log("Created auth user:", userRecord.uid);
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      console.log("User already exists — fetching record.");
      userRecord = await admin.auth().getUserByEmail(email);
    } else {
      throw e;
    }
  }

  await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
  console.log("Set admin claim on", userRecord.uid);

  const profile = {
    username: username.toLowerCase(),
    role: "admin",
    phoneE164,
    displayName: username,
    createdAt: Date.now(),
    createdBy: "seed",
  };
  const updates = {};
  updates[`users/${userRecord.uid}`]                  = profile;
  updates[`usernameIndex/${username.toLowerCase()}`]  = userRecord.uid;
  updates[`phoneIndex/${phoneIdx}`]                   = userRecord.uid;
  await admin.database().ref().update(updates);

  console.log("Seeded admin profile + indices.");
  process.exit(0);
})().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
