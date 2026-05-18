// Firebase client init. Reads its non-secret web-config from VITE_* env vars
// (config is public; security is enforced by Auth + Rules + per-IP rate
// limits on the one public Cloud Function).
//
// In development we connect to the local Firebase Emulator Suite by setting
// VITE_USE_EMULATORS=1 in `.env`.
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

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

export const app       = initializeApp(firebaseConfig);
export const auth      = getAuth(app);
export const db        = getDatabase(app);
export const firestore = getFirestore(app);
// Functions deployed in the default region; override here if you change region.
export const functions = getFunctions(app, "us-central1");
export const storage   = getStorage(app);

// Persist the auth session across page reloads (matches the original UX).
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Local-emulator wiring. The host is fixed at 127.0.0.1; ports must match firebase.json.
const useEmulators =
  env.VITE_USE_EMULATORS === "1" || env.VITE_USE_EMULATORS === "true";
if (useEmulators) {
  try { connectAuthEmulator(auth,           "http://127.0.0.1:9099", { disableWarnings: true }); } catch {}
  try { connectDatabaseEmulator(db,         "127.0.0.1", 9000); } catch {}
  try { connectFirestoreEmulator(firestore, "127.0.0.1", 8080); } catch {}
  try { connectStorageEmulator(storage,     "127.0.0.1", 9199); } catch {}
  try { connectFunctionsEmulator(functions, "127.0.0.1", 5001); } catch {}
}
