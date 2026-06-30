// @dawa/core barrel.
//
// Consumers (the web frontend's re-export shims and the Expo app) import deep
// subpaths directly — e.g. `@dawa/core/utils/apiClient.js`,
// `@dawa/core/services/guests.js` — which keeps tree-shaking tight and avoids a
// giant barrel that pulls every service into every bundle.
//
// Only the platform adapter setters are surfaced here as a convenience, since a
// platform shell wires them once at boot.
export { setEnv, getEnv } from "./adapters/env.js";
export { setStorage, getStorage } from "./adapters/storage.js";
