// Cloud Functions entry — initializes the Admin SDK once and re-exports every
// callable function. Each function file is self-contained: validation,
// authz, rate limiting and audit logging all live next to the handler.
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { createPortalUser, deletePortalUser, setAdminClaim } from "./users";
export { updatePortalUser }    from "./updateUser";
export { adminSetPassword }    from "./adminSetPassword";
export { assignDriverToGroom } from "./assignments";
export { submitConfirmation }  from "./confirmations";
export { attachConfirmationLocationToGuest } from "./attachLocation";
export { resetPassword }       from "./resetPassword";
export { createGuestInvite, submitGuestInvite } from "./invite";
export { createDigitalGuestInvite, submitDigitalGuestInvite } from "./digitalInvite";
