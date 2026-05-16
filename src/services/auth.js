// Auth service — wraps Firebase Auth in the small surface the app actually needs.
// Login uses synthetic emails of the form `<username>@dawa.local` so the rest
// of the app can keep its "username + password" UX.
//
// Source of truth for "what role is this user?" is the JWT custom claim
// `role` ("admin" | "driver" | "groom"). The RTDB profile mirror at
// /users/{uid}/role is used only as a fallback if the claim is missing
// (mid-migration / legacy users). The server-side rule check is
// `auth.token.role === 'admin'`, so the client matches that.
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
import { logWarn } from "../utils/logger.js";

const SYNTHETIC_DOMAIN = "@dawa.local";

const syntheticEmail = (username) => `${username.trim().toLowerCase()}${SYNTHETIC_DOMAIN}`;

// Sign in with username + password.
export async function signIn(username, password) {
  return signInWithEmailAndPassword(auth, syntheticEmail(username), password);
}

export function signOutNow() {
  return signOut(auth);
}

// Force-refresh the ID token. Used by the callable() retry path when a server
// call returns permission-denied/unauthenticated — most likely cause is a
// stale token that doesn't yet carry a freshly-granted custom claim.
export async function forceRefreshToken() {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken(true);
}

// Fetch the portal profile for a given uid (role, username, phone, ...).
// On Firebase RTDB "permission-denied" we retry once after a short delay —
// the RTDB SDK's internal auth listener can lag a moment behind
// onAuthStateChanged / onIdTokenChanged, so the first read can hit the
// rule with `auth == null` even though the user is signed in. The retry
// gives the SDK a tick to catch up. If it still fails we return null so
// the caller can degrade to a claims-only profile instead of crashing.
export async function fetchProfile(uid) {
  if (!uid) return null;
  const read = () => get(ref(db, `users/${uid}`));
  let snap;
  try {
    snap = await read();
  } catch (e) {
    if (e?.code === "PERMISSION_DENIED" || /permission[_ ]denied/i.test(e?.message || "")) {
      await new Promise((r) => setTimeout(r, 250));
      try { snap = await read(); }
      catch (e2) {
        logWarn("fetchProfile", e2);
        return null;
      }
    } else {
      logWarn("fetchProfile", e);
      return null;
    }
  }
  return snap.exists() ? { uid, ...snap.val() } : null;
}

// Build the auth-user object the rest of the app consumes. `role` and
// `username` prefer the JWT claim (canonical) and fall back to the RTDB
// profile (mid-migration safety net).
function shapeAuthUser(fbUser, profile, claims) {
  return {
    uid:       fbUser.uid,
    username:  claims?.username ?? profile?.username  ?? null,
    role:      claims?.role     ?? profile?.role      ?? null,
    phoneE164: profile?.phoneE164 ?? null,
    claims:    claims ?? {},
  };
}

// Run the auth-enrichment pipeline (profile read + token decode) and hand the
// result to `cb`. Any error is contained here so the listener never surfaces
// an unhandled promise rejection; if the profile read failed we still call
// `cb` with the token claims alone — the rest of the app reads `role` and
// `username` from claims first anyway.
async function emitAuthSnapshot(fbUser, cb, { forceRefresh }) {
  try {
    const [profile, tokenResult] = await Promise.all([
      fetchProfile(fbUser.uid),
      fbUser.getIdTokenResult(forceRefresh),
    ]);
    cb(shapeAuthUser(fbUser, profile, tokenResult.claims));
  } catch (e) {
    logWarn("emitAuthSnapshot", e);
    try {
      const tokenResult = await fbUser.getIdTokenResult();
      cb(shapeAuthUser(fbUser, null, tokenResult.claims));
    } catch (e2) {
      logWarn("emitAuthSnapshot fallback", e2);
      cb(shapeAuthUser(fbUser, null, {}));
    }
  }
}

// Subscribe to authentication state changes, enriched with the user's profile
// and custom claims. `cb` receives `null` when signed out, otherwise the
// shape produced by `shapeAuthUser` above.
export function subscribeAuth(cb) {
  return onAuthStateChanged(auth, (fbUser) => {
    if (!fbUser) { cb(null); return; }
    emitAuthSnapshot(fbUser, cb, { forceRefresh: true });
  });
}

// Subscribe to ID-token refreshes so callers see fresh custom claims (role
// changes, new driver assignments, …) without forcing a sign-out / sign-in.
// `cb` gets the same shape as subscribeAuth — the consumer can replace its
// auth-user state with whatever fires last.
export function subscribeIdToken(cb) {
  return onIdTokenChanged(auth, (fbUser) => {
    if (!fbUser) { cb(null); return; }
    emitAuthSnapshot(fbUser, cb, { forceRefresh: false });
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
