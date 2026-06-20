// Cloud Functions entry — initializes the Admin SDK once and exports every
// deployable function.
//
// Two function families live here:
//   1. The new Express REST API, exported as `api`. This is the long-term
//      home for all frontend → backend traffic. See `./api/index.ts`.
//   2. The legacy onCall + onRequest functions, re-exported below.
//      These are being progressively migrated into the Express router and
//      will be removed file-by-file (see Step 37 of the migration plan).
//
// The migration sequence: each route handler is duplicated into the Express
// router with identical semantics. Once the frontend points exclusively at
// the REST endpoint, the legacy export is deleted. `digitalInvitePreview`
// is the one exception — it stays as an onRequest because it has its own
// hosting rewrite (`/d/**`) and its own caching strategy.
import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";

initializeApp();

import { app as expressApp } from "./api/index";

/**
 * The new Express-backed REST API.
 *
 * `timeoutSeconds: 3600` (60 minutes — the v2 maximum) is required because
 * the live-locations SSE stream holds the response open for the duration
 * of the groom's session. All other routes finish in milliseconds; the
 * long timeout has no effect on their billing or behavior.
 *
 * `memory: "512MiB"` is a modest bump above the default to keep the SSE
 * listener responsive when many grooms watch concurrently.
 */
export const api = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 3600,
    memory: "512MiB",
    cors: false, // CORS is handled inside the Express app, not by the framework.
    // Cap concurrency so a traffic spike or polling bug can't fan out to an
    // unbounded (and unbudgeted) number of instances. Sized well above the
    // ~20–30 concurrent-weddings ceiling so real load is never throttled.
    maxInstances: 20,
  },
  expressApp,
);

// ─── Standalone onRequest functions (kept outside the Express router) ───────
//
// `digitalInvitePreview` is its own hosting rewrite (`/d/**`) and has its
// own caching strategy distinct from the REST API. Keeping it as a separate
// `onRequest` export lets it scale and cache independently of the `api`
// function above.
export { digitalInvitePreview } from "./digitalInvitePreview";

// Dynamic Open Graph image (1200×630 JPEG) for WhatsApp/social link previews —
// its own hosting rewrite (`/og/**`) and cache strategy.
export { digitalOgImage } from "./digitalOgImage";

// Firestore trigger: maintains the face-descriptor index over photographer
// photos (digitalInvitations/{uid}/photoFaces). Separate function so its
// 2 GiB memory + tfjs runtime never affect the `api` function; the heavy
// engine is dynamically imported inside the handler.
export { indexPhotographerFile } from "./faceIndex/trigger";

// Meta WhatsApp Cloud API webhook (subscription verification + delivery/read
// receipts). Standalone so it never shares middleware with the REST `api` app.
export { whatsappWebhook } from "./whatsappWebhook";

// Daily Cloud Scheduler job that nudges unanswered digital-invite guests a week
// before the wedding (via the WhatsApp Cloud API; a no-op until configured).
export { sendRsvpReminders } from "./reminders";

// Scheduled debounced re-clustering of the People gallery: reclusters grooms
// whose photographer-upload burst has settled (clusterDirty + quiet period).
export { reclusterDirtyGalleries } from "./faceIndex/clusterJob";

// Daily biometric auto-purge: deletes the AWS face collection + Firestore face
// data ~30 days after the wedding (the privacy commitment shown to guests).
export { purgeExpiredFaces } from "./faceIndex/purge";

// Daily disaster-recovery snapshot of the Realtime Database to a GCS backup
// bucket (RTDB has no native scheduled export). No-op until BACKUP_BUCKET is
// configured — see backend/scripts/setup-backups.sh + docs/RUNBOOK.md.
export { backupRtdb } from "./backupRtdb";
