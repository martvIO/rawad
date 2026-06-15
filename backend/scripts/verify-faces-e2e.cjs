// End-to-end verification of the personal "your photos" flow against the
// running emulator suite + REAL AWS Rekognition (the functions emulator loads
// .env.local creds). Seeds a synthetic wedding, lets the indexing trigger run,
// then exercises the public token endpoints: enroll → matches → zip.
//
//   node backend/scripts/verify-faces-e2e.cjs
//
// Requires: emulators up (auth,database,firestore,storage,functions) AND AWS
// creds in backend/functions/.env.local. Cleans up the AWS collection after.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const admin = require("../functions/node_modules/firebase-admin");

const PROJECT_ID = "dawa-aa793";
const BUCKET = "dawa-aa793.firebasestorage.app";
const API = "http://127.0.0.1:5001/dawa-aa793/us-central1/api";
const FIXTURES = path.resolve(__dirname, "..", "..", "facerec_examples");
const UID = "e2egroomfaces";

// Load AWS creds from .env.local (for cleanup).
for (const line of fs.readFileSync(path.resolve(__dirname, "..", "functions", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.GCLOUD_PROJECT = PROJECT_ID;

admin.initializeApp({
  projectId: PROJECT_ID,
  databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}-default-rtdb`,
  storageBucket: BUCKET,
});
const fsdb = admin.firestore();
const rtdb = admin.database();
const bucket = admin.storage().bucket();

const listImages = (dir) => fs.readdirSync(dir).filter((n) => /\.(jpe?g|png)$/i.test(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("== seeding ==");
  await fsdb.doc(`digitalInvitations/${UID}`).set({ photographerPublished: true });

  // Upload a handful of pool photos + create photographerFiles docs (fires the
  // indexing trigger).
  const pool = listImages(path.join(FIXTURES, "photos_from_the_photographer")).slice(0, 6);
  let fileCount = 0;
  for (const name of pool) {
    const storagePath = `photographerFiles/${UID}/${Date.now()}_${fileCount}.jpg`;
    await bucket.file(storagePath).save(fs.readFileSync(path.join(FIXTURES, "photos_from_the_photographer", name)), {
      contentType: "image/jpeg",
    });
    await fsdb.collection(`digitalInvitations/${UID}/photographerFiles`).add({
      name, storagePath, type: "image/jpeg", url: `http://x/${name}`, uploadedAt: Date.now(),
    });
    fileCount++;
  }
  console.log(`uploaded ${fileCount} photos`);

  // Mint a digital guest token.
  const token = crypto.randomBytes(16).toString("hex");
  await rtdb.ref(`inviteTokens/${token}`).set({
    groomUid: UID, groomUsername: "e2e", guestId: "g1", guestName: "G1",
    guestPhone: "+972500000009", guestType: "digital",
    createdAt: Date.now(), expiresAt: Date.now() + 86400000,
  });

  // Wait for the trigger to index (Rekognition ~1-3s/photo + cold start).
  console.log("== waiting for indexing ==");
  let okCount = 0;
  for (let i = 0; i < 60; i++) {
    const snap = await fsdb.collection(`digitalInvitations/${UID}/photoFaces`).get();
    okCount = snap.docs.filter((d) => d.data().status === "ok").length;
    const provider = snap.docs[0]?.data()?.provider;
    process.stdout.write(`\r  indexed ${okCount}/${fileCount} (provider=${provider || "?"})   `);
    if (okCount >= fileCount) break;
    await sleep(3000);
  }
  console.log("");
  assert(okCount > 0, "no photos were indexed");

  // Enroll person_1's selfie (multipart upload path).
  console.log("== enroll (upload selfie) ==");
  const selfie = fs.readFileSync(path.join(FIXTURES, "persons_photo", "person_1", listImages(path.join(FIXTURES, "persons_photo", "person_1"))[0]));
  const fd = new FormData();
  fd.append("token", token);
  fd.append("phone", "+972500000009");
  fd.append("selfie", new Blob([selfie], { type: "image/jpeg" }), "selfie.jpg");
  const enrollRes = await fetch(`${API}/digital/photos/enroll?token=${token}`, { method: "POST", body: fd });
  const enrollBody = await enrollRes.json();
  console.log("  enroll status", enrollRes.status, "matches", enrollBody.matches?.length);
  assert(enrollRes.ok, `enroll failed: ${JSON.stringify(enrollBody)}`);
  assert((enrollBody.matches?.length ?? 0) > 0, "enroll returned no matches");

  // Matches endpoint.
  console.log("== matches ==");
  const mRes = await fetch(`${API}/digital/photos/matches?token=${token}`);
  const mBody = await mRes.json();
  console.log("  matches status", mRes.status, "enrolled", mBody.enrolled, "matches", mBody.matches?.length);
  assert(mBody.enrolled === true && (mBody.matches?.length ?? 0) > 0, "matches endpoint wrong");

  // ZIP download.
  console.log("== zip ==");
  const zRes = await fetch(`${API}/digital/photos/zip?token=${token}`);
  const zBuf = Buffer.from(await zRes.arrayBuffer());
  console.log("  zip status", zRes.status, "type", zRes.headers.get("content-type"), "bytes", zBuf.length);
  assert(zRes.ok && zBuf.length > 100 && zBuf.slice(0, 2).toString() === "PK", "zip invalid");

  console.log("\n✅ PERSONAL FLOW E2E PASSED");
}

function assert(cond, msg) { if (!cond) { console.error("\n❌ ASSERT FAILED:", msg); process.exitCode = 1; throw new Error(msg); } }

async function cleanup() {
  try {
    const { RekognitionClient, DeleteCollectionCommand } = require("../functions/node_modules/@aws-sdk/client-rekognition");
    const client = new RekognitionClient({ region: process.env.AWS_REGION });
    const prefix = process.env.REKOGNITION_COLLECTION_PREFIX || "dawa";
    await client.send(new DeleteCollectionCommand({ CollectionId: `${prefix}_${UID}` })).catch(() => {});
    console.log("cleaned AWS collection");
  } catch (e) { console.log("cleanup skipped:", e.message); }
}

main().catch((e) => console.error(e.message)).finally(() => cleanup().finally(() => process.exit(process.exitCode || 0)));
