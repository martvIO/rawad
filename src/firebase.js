// Firebase client SDK is no longer used.
//
// All operations are mediated by the REST API at `VITE_API_BASE_URL`.
// See:
//   - src/utils/apiClient.js   — fetch wrapper with auth + retry
//   - src/utils/tokenManager.js — idToken / refreshToken lifecycle
//   - src/services/*.js         — REST-based service layer
//
// This file is kept as an empty shell so legacy import statements (if any
// stragglers remain) don't crash at module-load time. It can be removed
// once a full search confirms no callers.

export {};
