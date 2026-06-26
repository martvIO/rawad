// Native storage adapter for @dawa/core — backed by expo-secure-store
// (iOS Keychain / Android Keystore), so auth tokens never sit in plaintext.
//
// All methods are async (secure-store is async). The shared tokenManager's hot
// path reads from its in-memory cache (sync); persistence is async and best-
// effort, and the session is hydrated at boot via loadStoredTokensAsync().
//
// Note: secure-store keys allow [A-Za-z0-9._-] — the shared "dawa.idToken" /
// "dawa_lang" keys all comply. Per-value size is limited (~2KB), which fits
// JWTs; larger optimization caches can move to AsyncStorage in a later phase.
import * as SecureStore from "expo-secure-store";

export const nativeStorage = {
  getItem(key) {
    return SecureStore.getItemAsync(key).catch(() => null);
  },
  setItem(key, value) {
    return SecureStore.setItemAsync(key, value).catch(() => {});
  },
  removeItem(key) {
    return SecureStore.deleteItemAsync(key).catch(() => {});
  },
};
