// Per-guest invite-link service. Mirrors confirmations.js: write goes through
// a callable, read goes straight to RTDB. Token records are publicly readable
// (rule allows it), so the InviteForm page works without authentication.
import { ref, onValue } from "firebase/database";
import { db } from "../firebase.js";
import { callable } from "./_helpers.js";
import { logErr } from "../utils/logger.js";

// Groom/admin → mint a new token for one guest.
// Payload: { groomUid, guestId }
// Returns: { token, expiresAt }
export const createGuestInvite = callable("createGuestInvite");

// Public → submit the invite form.
// Payload: { token, submittedName, submittedPhone, submittedCity,
//            submittedStreet?, submittedHouse?, deliveryNote?,
//            lat?, lng?, locationAccuracy?, locationSource? }
export const submitGuestInvite = callable("submitGuestInvite");

// Public read of the token record. Used by the InviteForm page to pre-fill
// the guest's name/phone and to check expiry before rendering the form.
export function subscribeInviteToken(token, cb) {
  if (!token) { cb(null); return () => {}; }
  return onValue(
    ref(db, `inviteTokens/${token}`),
    (snap) => cb(snap.exists() ? snap.val() : null),
    (err) => { logErr(`subscribeInviteToken(${token})`, err); cb(null); },
  );
}
