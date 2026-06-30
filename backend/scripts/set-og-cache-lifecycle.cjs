#!/usr/bin/env node
/**
 * One-time (idempotent) setup: add a 14-day deletion lifecycle rule to the
 * default Storage bucket, scoped to the `og-cache/` prefix — the pre-rendered
 * WhatsApp/OG preview images written by the cacheInviteOgImage trigger and the
 * /og/ handler. After ~14 days an unused preview is deleted to keep storage
 * lean; a later share simply re-renders + re-caches on miss.
 *
 * Non-destructive: reads the bucket's existing lifecycle rules and only appends
 * ours when it isn't already present, so any other rules are preserved.
 *
 * Auth (production): uses the gitignored repo-root service-account key, exactly
 * like the other backend/scripts. Just run:
 *   node backend/scripts/set-og-cache-lifecycle.cjs
 */
const path = require("path");
// firebase-admin lives in the functions package; the key is at the repo root.
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
const key = require(path.join(__dirname, "..", "..", "dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json"));

const PROJECT_ID = "dawa-aa793";
const BUCKET = "dawa-aa793.firebasestorage.app"; // NOT .appspot.com — the default bucket
const AGE_DAYS = 14;
const PREFIX = "og-cache/";

admin.initializeApp({
  credential: admin.credential.cert(key),
  projectId: PROJECT_ID,
  storageBucket: BUCKET,
});

(async () => {
  const bucket = admin.storage().bucket();
  const [metadata] = await bucket.getMetadata();
  const rules = (metadata.lifecycle && metadata.lifecycle.rule) || [];
  const already = rules.some(
    (r) =>
      r.action && r.action.type === "Delete" &&
      r.condition && r.condition.age === AGE_DAYS &&
      Array.isArray(r.condition.matchesPrefix) &&
      r.condition.matchesPrefix.includes(PREFIX)
  );
  if (already) {
    console.log(`[og-lifecycle] rule already present on ${bucket.name} — nothing to do`);
    return;
  }
  rules.push({ action: { type: "Delete" }, condition: { age: AGE_DAYS, matchesPrefix: [PREFIX] } });
  await bucket.setMetadata({ lifecycle: { rule: rules } });
  console.log(
    `[og-lifecycle] set ${AGE_DAYS}-day Delete for ${PREFIX}* on ${bucket.name} ` +
      `(total lifecycle rules now: ${rules.length})`
  );
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[og-lifecycle] failed:", e);
    process.exit(1);
  });
