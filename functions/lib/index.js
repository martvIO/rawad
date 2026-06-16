"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.digitalOgImage = exports.digitalInvitePreview = exports.api = void 0;
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
const app_1 = require("firebase-admin/app");
const https_1 = require("firebase-functions/v2/https");
(0, app_1.initializeApp)();
const index_1 = require("./api/index");
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
exports.api = (0, https_1.onRequest)({
    region: "us-central1",
    timeoutSeconds: 3600,
    memory: "512MiB",
    cors: false, // CORS is handled inside the Express app, not by the framework.
}, index_1.app);
// ─── Standalone onRequest functions (kept outside the Express router) ───────
//
// `digitalInvitePreview` is its own hosting rewrite (`/d/**`) and has its
// own caching strategy distinct from the REST API. Keeping it as a separate
// `onRequest` export lets it scale and cache independently of the `api`
// function above.
var digitalInvitePreview_1 = require("./digitalInvitePreview");
Object.defineProperty(exports, "digitalInvitePreview", { enumerable: true, get: function () { return digitalInvitePreview_1.digitalInvitePreview; } });
// Dynamic Open Graph image (1200×630 JPEG) for WhatsApp/social link previews —
// its own hosting rewrite (`/og/**`) and cache strategy.
var digitalOgImage_1 = require("./digitalOgImage");
Object.defineProperty(exports, "digitalOgImage", { enumerable: true, get: function () { return digitalOgImage_1.digitalOgImage; } });
//# sourceMappingURL=index.js.map