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

// App Check — every RTDB / Storage / Functions call must carry a valid
// App Check token, blocking traffic from scripts that aren't this app.
//
// Production: reCAPTCHA Enterprise provider attests the origin.
// Localhost: debug-token mode — the SDK uses a randomly-generated token
//   (or VITE_APP_CHECK_DEBUG_TOKEN if you set one) instead of reCAPTCHA,
//   which is rejected on the server until the token is registered in
//   Firebase Console → App Check → Apps → [your web app] → Manage debug
//   tokens. On the first run with debug mode on, the SDK prints the
//   generated token to the browser console — copy that into the console
//   and the call will be authorised. This avoids the reCAPTCHA-Enterprise
//   24-hour throttle that triggers when origin checks fail.
// Skipped entirely in emulator mode.
const useEmulators =
  env.VITE_USE_EMULATORS === "1" || env.VITE_USE_EMULATORS === "true";
const isLocalhost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

if (typeof self !== "undefined" && isLocalhost && !useEmulators) {
  // `true` → SDK generates and prints a token. A string → SDK uses that
  // exact token (handy for sharing one across the dev team).
  // eslint-disable-next-line no-undef
  self.FIREBASE_APPCHECK_DEBUG_TOKEN =
    env.VITE_APP_CHECK_DEBUG_TOKEN || true;
}

if (!useEmulators && env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  if (isLocalhost) {
    // eslint-disable-next-line no-console
    console.info(
      "[App Check] Debug mode is ON for localhost. Look above for a line " +
      "like 'App Check debug token: <UUID>' and register it in Firebase " +
      "Console → App Check → Apps → [web app] → Manage debug tokens.",
    );
  }
}

// Local-emulator wiring. The host is fixed at 127.0.0.1; ports must match firebase.json.
if (useEmulators) {
  try { connectAuthEmulator(auth,     "http://127.0.0.1:9099", { disableWarnings: true }); } catch {}
  try { connectDatabaseEmulator(db,   "127.0.0.1", 9000); } catch {}
  try { connectStorageEmulator(storage,"127.0.0.1", 9199); } catch {}
  try { connectFunctionsEmulator(functions, "127.0.0.1", 5001); } catch {}
}
