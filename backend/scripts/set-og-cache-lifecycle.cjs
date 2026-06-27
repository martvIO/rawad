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
 * Auth (production): set GOOGLE_APPLICATION_CREDENTIALS to the repo-root
 * service-account key (the gitignored dawa-aa793-firebase-adminsdk-*.json), then:
 *   GOOGLE_APPLICATION_CREDENTIALS=./dawa-aa793-firebase-adminsdk-*.json \
 *     node backend/scripts/set-og-cache-lifecycle.cjs
 */
const admin = require("firebase-admin");

const PROJECT_ID = "dawa-aa793";
const BUCKET = "dawa-aa793.firebasestorage.app"; // NOT .appspot.com — the default bucket
const AGE_DAYS = 14;
const PREFIX = "og-cache/";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "[og-lifecycle] ERROR: set GOOGLE_APPLICATION_CREDENTIALS to the repo-root " +
      "service-account key before running (the key is gitignored)."
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
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
