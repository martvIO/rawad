// Face Liveness config flags — env-only, NO aws-amplify import so this stays
// out of the main bundle. The heavy Amplify core is imported solely by the
// lazy-loaded LivenessCapture component (camera path), keeping it code-split.
//
//   VITE_COGNITO_IDENTITY_POOL_ID, VITE_AWS_REGION
// When unset, livenessConfigured() is false and the UI hides the camera option
// (the upload path still works).

export const COGNITO_IDENTITY_POOL_ID = import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID || "";
export const LIVENESS_REGION = import.meta.env.VITE_AWS_REGION || "";

export function livenessConfigured() {
  return !!(COGNITO_IDENTITY_POOL_ID && LIVENESS_REGION);
}
