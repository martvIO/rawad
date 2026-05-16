// Firebase client init. Reads its non-secret web-config from VITE_* env vars
// (config is public; security is enforced by Auth + Rules + App Check).
//
// In development we connect to the local Firebase Emulator Suite by setting
// VITE_USE_EMULATORS=1 in `.env`. In production we initialize App Check so
// only attested instances of the app can reach the backend.
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

const env = import.meta.env;

const firebaseConfig = {
  apiKey:            env.VITE_FIREBASE_API_KEY,
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       env.VITE_FIREBASE_DATABASE_URL,
  projectId:         env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.VITE_FIREBASE_APP_ID,
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getDatabase(app);
// Functions deployed in the default region; override here if you change region.
export const functions = getFunctions(app, "us-central1");
export const storage   = getStorage(app);

// Persist the auth session across page reloads (matches the original UX).
setPersistence(auth, browserLocalPersistence).catch(() => {});

// App Check — production-domain only. Skipped in two cases:
//   1. Emulator mode (dev with VITE_USE_EMULATORS=1).
//   2. Running on localhost / 127.0.0.1, UNLESS VITE_APP_CHECK_ON_LOCALHOST=1.
//      reCAPTCHA Enterprise rejects unregistered origins with 403, and on
//      the first failure App Check throttles every Firebase call for 24h
//      (cached in IndexedDB). The default skip on localhost avoids that
//      trap; opt back in only after `localhost` / `127.0.0.1` are listed in
//      the reCAPTCHA Enterprise key's allowed domains.
const useEmulators =
  env.VITE_USE_EMULATORS === "1" || env.VITE_USE_EMULATORS === "true";
const isLocalhost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);
const allowAppCheckOnLocalhost =
  env.VITE_APP_CHECK_ON_LOCALHOST === "1" ||
  env.VITE_APP_CHECK_ON_LOCALHOST === "true";

if (
  !useEmulators &&
  env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY &&
  (!isLocalhost || allowAppCheckOnLocalhost)
) {
  // Once enrolled, every RTDB / Storage / Functions call must carry a
  // valid App Check token, blocking traffic from scripts that aren't this app.
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

// Local-emulator wiring. The host is fixed at 127.0.0.1; ports must match firebase.json.
if (useEmulators) {
  try { connectAuthEmulator(auth,     "http://127.0.0.1:9099", { disableWarnings: true }); } catch {}
  try { connectDatabaseEmulator(db,   "127.0.0.1", 9000); } catch {}
  try { connectStorageEmulator(storage,"127.0.0.1", 9199); } catch {}
  try { connectFunctionsEmulator(functions, "127.0.0.1", 5001); } catch {}
}
