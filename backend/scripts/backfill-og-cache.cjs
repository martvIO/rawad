#!/usr/bin/env node
/**
 * One-time backfill: pre-render the OG preview image for every NON-EXPIRED invite
 * token that was minted before the cacheInviteOgImage trigger existed, so their
 * first WhatsApp share also shows the large preview.
 *
 * How: it hits the live /og/{token}.jpg endpoint (cache-busted to bypass the CDN
 * and force the function), which renders + writes og-cache/{token}.jpg on a miss.
 * So this needs no canvas locally — only RTDB read access + network.
 *
 * IMPORTANT: this only helps tokens WhatsApp hasn't scraped yet. A token already
 * shared and cached by WhatsApp as "no image" won't recover in place (WhatsApp
 * has no public re-scrape) — re-send that one under a brand-new link.
 *
 * Auth (production): GOOGLE_APPLICATION_CREDENTIALS = repo-root service-account key.
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./dawa-aa793-firebase-adminsdk-*.json \
 *     node backend/scripts/backfill-og-cache.cjs [--base=https://invite.dawa.to] [--dry]
 */
const admin = require("firebase-admin");

const PROJECT_ID = "dawa-aa793";
const PROD_DATABASE_URL = "https://dawa-aa793-default-rtdb.firebaseio.com";
const BASE =
  (process.argv.find((a) => a.startsWith("--base=")) || "").split("=")[1] ||
  process.env.OG_BASE ||
  "https://invite.dawa.to";
const DRY = process.argv.includes("--dry");
const CONCURRENCY = 4;

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "[og-backfill] ERROR: set GOOGLE_APPLICATION_CREDENTIALS to the repo-root " +
      "service-account key before running (the key is gitignored)."
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
  databaseURL: PROD_DATABASE_URL,
});

(async () => {
  const snap = await admin.database().ref("inviteTokens").get();
  const all = snap.val() || {};
  const now = Date.now();
  const tokens = Object.entries(all)
    .filter(([, rec]) => rec && (!rec.expiresAt || rec.expiresAt > now))
    .map(([t]) => t);

  console.log(`[og-backfill] ${tokens.length} non-expired tokens; base=${BASE}${DRY ? " (DRY RUN)" : ""}`);
  if (DRY) { tokens.slice(0, 10).forEach((t) => console.log("  would warm:", t)); return; }

  let i = 0, ok = 0, fail = 0;
  async function worker() {
    while (i < tokens.length) {
      const t = tokens[i++];
      try {
        const r = await fetch(`${BASE}/og/${t}.jpg?cb=bf${now}`, { redirect: "follow" });
        if (r.ok) ok++;
        else { fail++; console.warn(`[og-backfill] ${t} -> HTTP ${r.status}`); }
      } catch (e) {
        fail++;
        console.warn(`[og-backfill] ${t} -> ${e.message}`);
      }
      if ((ok + fail) % 25 === 0) console.log(`[og-backfill] progress ${ok + fail}/${tokens.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[og-backfill] done: ok=${ok} fail=${fail}`);
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[og-backfill] failed:", e);
    process.exit(1);
  });
