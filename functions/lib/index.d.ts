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
export declare const api: import("firebase-functions/v2/https").HttpsFunction;
export { digitalInvitePreview } from "./digitalInvitePreview";
export { digitalOgImage } from "./digitalOgImage";
