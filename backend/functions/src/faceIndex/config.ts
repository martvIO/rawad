// Face-engine configuration — SDK-free so it can be imported anywhere
// (trigger, backfill, api routes) without pulling the AWS SDK or tfjs in.
//
// The platform is mid-migration from the self-hosted face-api engine to AWS
// Rekognition. Which engine is "active" is decided purely by whether AWS
// credentials are present in the environment:
//   - creds set   → Rekognition (one collection per wedding)
//   - creds unset → legacy face-api (no regression in dev/emulator)
//
// Every photoFaces row stamps the engine version it was produced with, so a
// freshness check can tell a stale (wrong-engine) row from a current one and
// re-index it. Flipping engines therefore re-indexes everything automatically
// the next time backfill runs (reindex endpoint / photographerPublished flip).

/** True when the three AWS env vars needed to talk to Rekognition are set. */
export function isRekognitionConfigured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION
  );
}

/** Version tag stamped on photoFaces rows produced by the Rekognition engine. */
export const REKOGNITION_INDEX_VERSION = "rekognition-v1";

/**
 * The index version a freshly-written row should carry RIGHT NOW. Pass the
 * legacy face-api `MODEL_VERSION` so callers don't have to import it twice.
 */
export function activeIndexVersion(faceApiVersion: string): string {
  return isRekognitionConfigured() ? REKOGNITION_INDEX_VERSION : faceApiVersion;
}
