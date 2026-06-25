// Production wiring for the admin-settings domain module: bind makeSettingsStore
// to the real Realtime Database port. Built PER REQUEST like the other store
// builders.

import { rtdbPort } from "../firebaseAdapters";
import { makeSettingsStore, SettingsStore } from "./settingsStore";

/** Request-scoped admin-settings store over the real Realtime Database. */
export function firebaseSettingsStore(): SettingsStore {
  return makeSettingsStore({ db: rtdbPort() });
}
