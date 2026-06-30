// Storage adapter.
//
// Shared modules that persist small key/value state (utils/tokenManager.js,
// utils/storage.js) route through this seam instead of touching `localStorage`
// directly, so the same code runs on web and React Native:
//   - Web   → a synchronous localStorage wrapper (frontend/src/adapters/webStorage.js)
//   - Native→ expo-secure-store / AsyncStorage (async — wired in the Expo app)
//
// The interface intentionally allows BOTH sync (web) and async (native) returns.
// On web every method is synchronous, so tokenManager's hot path stays sync.
//
// Implementation contract (all three must NEVER throw — degrade silently):
//   getItem(key)        -> string | null            (or Promise of same on native)
//   setItem(key, value) -> void                      (or Promise<void>)
//   removeItem(key)     -> void                      (or Promise<void>)

let _storage = null;

/** Inject the platform storage implementation. */
export function setStorage(impl) {
  _storage = impl;
}

/**
 * Return the active storage implementation. Callers wrap usage in try/catch
 * already, so a null here (adapter not yet wired) surfaces as a caught error
 * and degrades to the in-memory / fallback path rather than crashing.
 */
export function getStorage() {
  return _storage;
}
