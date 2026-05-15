// Auth service — wraps Firebase Auth in the small surface the app actually needs.
// Login uses synthetic emails of the form `<username>@dawa.local` so the rest
// of the app can keep its "username + password" UX.
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, db } from "../firebase.js";

const SYNTHETIC_DOMAIN = "@dawa.local";

const syntheticEmail = (username) => `${username.trim().toLowerCase()}${SYNTHETIC_DOMAIN}`;

// Sign in with username + password.
export async function signIn(username, password) {
  return signInWithEmailAndPassword(auth, syntheticEmail(username), password);
}

export function signOutNow() {
  return signOut(auth);
}

// Fetch the portal profile for a given uid (role, username, phone, ...).
export async function fetchProfile(uid) {
  if (!uid) return null;
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? { uid, ...snap.val() } : null;
}

// Subscribe to authentication state changes, enriched with the user's profile
// and admin custom claim. `cb` receives `null` when signed out, otherwise
// { uid, username, role, phoneE164, claims }.
export function subscribeAuth(cb) {
  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) { cb(null); return; }
    const [profile, tokenResult] = await Promise.all([
      fetchProfile(fbUser.uid),
      fbUser.getIdTokenResult(true),
    ]);
    cb({
      uid:      fbUser.uid,
      username: profile?.username ?? null,
      role:     profile?.role     ?? null,
      phoneE164: profile?.phoneE164 ?? null,
      claims:   tokenResult.claims,
    });
  });
}

// Subscribe to ID-token refreshes so callers see fresh custom claims (admin
// promotion, new driver assignments, …) without forcing a sign-out / sign-in.
export function subscribeIdToken(cb) {
  return onIdTokenChanged(auth, async (fbUser) => {
    if (!fbUser) { cb(null); return; }
    const tokenResult = await fbUser.getIdTokenResult(true);
    cb(tokenResult.claims);
  });
}

// ── Password-reset flow (Phone OTP) ───────────────────────────────────────────
// Step 1: send an SMS code to the given phone. The `containerId` is the DOM
// id of an empty <div> the invisible reCAPTCHA mounts into.
export async function sendPasswordResetCode(phoneE164, containerId) {
  const verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
  return signInWithPhoneNumber(auth, phoneE164, verifier);
}

// Step 2: confirm the code; on success the user is signed in as a phone-auth
// user. Pair this with services/users.callResetPassword to update the real
// portal-user's password.
export async function confirmPasswordResetCode(confirmationResult, code) {
  return confirmationResult.confirm(code);
}
