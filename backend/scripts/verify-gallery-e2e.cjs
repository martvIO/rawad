// E2E verification of the People-gallery path against emulator + real
// Rekognition: seed → index → authed recompute → clusters → grant-gated public
// read. Run after the emulators are up. Cleans up the AWS collection.
//   node backend/scripts/verify-gallery-e2e.cjs
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const admin = require("../functions/node_modules/firebase-admin");

const PROJECT_ID = "dawa-aa793";
const BUCKET = "dawa-aa793.firebasestorage.app";
const API = "http://127.0.0.1:5001/dawa-aa793/us-central1/api";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts";
const FIXTURES = path.resolve(__dirname, "..", "..", "facerec_examples");
const UID = "e2egallery";
const USERNAME = "e2eg";

for (const line of fs.readFileSync(path.resolve(__dirname, "..", "functions", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.GCLOUD_PROJECT = PROJECT_ID;
admin.initializeApp({ projectId: PROJECT_ID, databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}-default-rtdb`, storageBucket: BUCKET });
const fsdb = admin.firestore(), rtdb = admin.database(), bucket = admin.storage().bucket();
const listImages = (d) => fs.readdirSync(d).filter((n) => /\.(jpe?g|png)$/i.test(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
function assert(c, m) { if (!c) { console.error("\n❌", m); process.exitCode = 1; throw new Error(m); } }

async function main() {
  console.log("== seeding gallery ==");
  await fsdb.doc(`digitalInvitations/${UID}`).set({ photographerPublished: true, defaultDesignId: "d1" });
  await fsdb.doc(`digitalInvitations/${UID}/designs/d1`).set({ designStatus: "approved", themeColor: "rose", fontFamily: "amiri", brideName: "Lina", groomDisplayName: "Sami", weddingDate: Date.now() });
  await fsdb.doc(`digitalInvitations/${UID}/galleryConfig/config`).set({ enabled: true, galleryStatus: "approved", layout: "grid" });
  await rtdb.ref(`usernameIndex/${USERNAME}`).set(UID);

  const pool = listImages(path.join(FIXTURES, "photos_from_the_photographer")).slice(0, 8);
  for (let i = 0; i < pool.length; i++) {
    const sp = `photographerFiles/${UID}/${Date.now()}_${i}.jpg`;
    await bucket.file(sp).save(fs.readFileSync(path.join(FIXTURES, "photos_from_the_photographer", pool[i])), { contentType: "image/jpeg" });
    await fsdb.collection(`digitalInvitations/${UID}/photographerFiles`).add({ name: pool[i], storagePath: sp, type: "image/jpeg", url: `http://x/${pool[i]}`, uploadedAt: Date.now() });
  }
  console.log(`uploaded ${pool.length} photos`);

  console.log("== waiting for indexing ==");
  let ok = 0;
  for (let i = 0; i < 60; i++) {
    const s = await fsdb.collection(`digitalInvitations/${UID}/photoFaces`).get();
    ok = s.docs.filter((d) => d.data().status === "ok").length;
    process.stdout.write(`\r  indexed ${ok}/${pool.length}   `);
    if (ok >= pool.length) break;
    await sleep(3000);
  }
  console.log("");
  assert(ok > 0, "no indexing");

  // Admin ID token via custom-token exchange (emulator).
  await admin.auth().createUser({ uid: "e2eadmin" }).catch(() => {});
  const customToken = await admin.auth().createCustomToken("e2eadmin", { role: "admin", username: "e2eadmin" });
  const ex = await fetch(`${AUTH}:signInWithCustomToken?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  const { idToken } = await ex.json();
  assert(idToken, "no admin idToken");
  const authH = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };

  console.log("== recompute (authed) ==");
  const rc = await fetch(`${API}/digital/${UID}/gallery/recompute`, { method: "POST", headers: authH, body: "{}" });
  const rcBody = await rc.json();
  console.log("  recompute status", rc.status, JSON.stringify(rcBody));
  assert(rc.ok && rcBody.clusterCount >= 2, `recompute wrong: ${JSON.stringify(rcBody)}`);

  console.log("== clusters (authed) ==");
  const cl = await fetch(`${API}/digital/${UID}/gallery/clusters`, { headers: authH });
  const clBody = await cl.json();
  console.log("  clusters", clBody.length, "top photoCount", clBody[0]?.photoCount);
  assert(Array.isArray(clBody) && clBody.length >= 2, "clusters wrong");

  // Mint a grant directly (the OTP/phone-auth path can't run in the emulator).
  console.log("== public gallery read (grant) ==");
  const grant = crypto.randomBytes(24).toString("hex");
  await rtdb.ref(`galleryGrants/${UID}/${sha(grant)}`).set({ phoneE164: "+972500000009", expiresAt: Date.now() + 3600000 });
  const g = await fetch(`${API}/digital/gallery/${USERNAME}?galleryToken=${grant}`);
  const gBody = await g.json();
  console.log("  gallery status", g.status, "people", gBody.people?.length, "theme", gBody.config?.themeColor, "names", gBody.config?.brideName, gBody.config?.groomDisplayName);
  assert(g.ok && (gBody.people?.length ?? 0) >= 2 && gBody.config?.themeColor === "rose", "gallery read wrong");

  // One person's photos.
  const personId = gBody.people[0].clusterId;
  const p = await fetch(`${API}/digital/gallery/${USERNAME}/person/${personId}?galleryToken=${grant}`);
  const pBody = await p.json();
  console.log("  person photos", pBody.photos?.length);
  assert(p.ok && (pBody.photos?.length ?? 0) > 0, "person photos wrong");

  console.log("\n✅ GALLERY FLOW E2E PASSED");
}

async function cleanup() {
  try {
    const { RekognitionClient, DeleteCollectionCommand } = require("../functions/node_modules/@aws-sdk/client-rekognition");
    const client = new RekognitionClient({ region: process.env.AWS_REGION });
    await client.send(new DeleteCollectionCommand({ CollectionId: `${process.env.REKOGNITION_COLLECTION_PREFIX || "dawa"}_${UID}` })).catch(() => {});
    console.log("cleaned AWS collection");
  } catch (e) { console.log("cleanup skipped:", e.message); }
}
main().catch((e) => console.error(e.message)).finally(() => cleanup().finally(() => process.exit(process.exitCode || 0)));
