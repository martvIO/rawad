// localStorage key strings used by the app. Centralized here so renames are
// a one-line change and so the prefix scheme stays consistent.
//
// Token-manager keys (idToken / refreshToken / expiresAt / uid) live inside
// src/utils/tokenManager.js since they form a self-contained namespaced
// scheme ("dawa.*") and are not referenced from anywhere else.

export const STORAGE_KEYS = Object.freeze({
  /** Which groom the currently-signed-in driver has chosen to serve. */
  DRIVER_SERVING_GROOM: "dawa_driver_serving_groom",
  /** Which invite type ("handwritten" / "digital") the groom last picked. */
  GROOM_TYPE: "dawa_groom_type",
});
