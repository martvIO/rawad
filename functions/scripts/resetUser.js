// Local repair: reset a portal user's password and optionally stamp admin:true.
// Run from your machine with the service-account key — never exposed to the
// browser. The Firebase Auth REST endpoint that the client uses doesn't allow
// password reset without first knowing the old password, so we go through the
// Admin SDK.
//
// Usage (against live Firebase):
//   set GOOGLE_APPLICATION_CREDENTIALS=./dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json
//   set GCLOUD_PROJECT=dawa-aa793
//   node functions/scripts/resetUser.js <username> <newPassword> [--admin]
const admin = require("firebase-admin");

const args = process.argv.slice(2);
const [username, newPassword] = args;
const setAdmin = args.includes("--admin");
if (!username || !newPassword) {
  console.error("Usage: node resetUser.js <username> <newPassword> [--admin]");
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
    console.error(`No Auth user for ${email}:`, e.message);
    process.exit(2);
  }
  console.log(`Found ${email} → uid=${user.uid}`);

  // 1. Reset password and revoke any existing refresh tokens so old sessions die.
  await admin.auth().updateUser(user.uid, { password: newPassword });
  await admin.auth().revokeRefreshTokens(user.uid);
  console.log("✓ Password reset.");

  // 2. (Optional) Stamp role:"admin" claim and force role=admin in RTDB.
  if (setAdmin) {
    const existing = user.customClaims ?? {};
    // Drop legacy admin:true if present; we now use role as the single claim.
    // eslint-disable-next-line no-unused-vars
    const { admin: _legacyAdmin, ...rest } = existing;
    // Best-effort: also stamp username so the claim mirrors what
    // createPortalUser would have set. Fall back to the part of the email
    // before "@dawa.local" if the profile is missing.
    let usernameClaim = rest.username;
    if (!usernameClaim) {
      const profileSnap = await admin.database().ref(`users/${user.uid}/username`).get();
      usernameClaim = profileSnap.exists()
        ? profileSnap.val()
        : user.email.replace(/@.*/, "");
    }
    await admin.auth().setCustomUserClaims(user.uid, {
      ...rest,
      role: "admin",
      username: usernameClaim,
    });
    console.log(`✓ Custom claims set: role="admin", username="${usernameClaim}".`);
    await admin.database().ref(`users/${user.uid}/role`).set("admin");
    console.log("✓ RTDB role=admin ensured.");
  }

  console.log(`\nDone. Sign in as username "${username}" with the new password.`);
  console.log("If you were already signed in, you'll be forced to sign in again.");
  process.exit(0);
})().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
