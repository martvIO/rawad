"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignDriverToGroom = void 0;
// Drivers don't pick a groom by writing the assignment directly (security
// rules forbid that). Instead they call this function, which:
//   1. Verifies the caller is a driver.
//   2. Resolves the groom's username → uid via the usernameIndex.
//   3. Writes /driverAssignments/{driverUid}/{groomUid} = true.
//   4. Re-stamps the driver's `assignedGrooms` custom claim so Storage rules
//      can verify proof-photo uploads.
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("firebase-admin/auth");
const database_1 = require("firebase-admin/database");
const audit_1 = require("./audit");
const helpers_1 = require("./helpers");
// App Check is OFF — driver-only callable already gated by an auth check
// plus a profile role lookup. See users.ts for the policy rationale.
exports.assignDriverToGroom = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign in required.");
    const driverUid = req.auth.uid;
    // Caller must be a driver. Read the profile (rules let them read their own).
    const callerProfile = (await (0, database_1.getDatabase)().ref(`users/${driverUid}`).get()).val();
    if (callerProfile?.role !== "driver") {
        throw new https_1.HttpsError("permission-denied", "Drivers only.");
    }
    const groomUsername = (req.data?.groomUsername ?? "").toString().toLowerCase();
    if (!(0, helpers_1.isUsername)(groomUsername)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid groom username.");
    }
    const db = (0, database_1.getDatabase)();
    const groomUidSnap = await db.ref(`usernameIndex/${groomUsername}`).get();
    if (!groomUidSnap.exists())
        throw new https_1.HttpsError("not-found", "Unknown groom.");
    const groomUid = groomUidSnap.val();
    const groomProfile = (await db.ref(`users/${groomUid}`).get()).val();
    if (groomProfile?.role !== "groom") {
        throw new https_1.HttpsError("failed-precondition", "Target user is not a groom.");
    }
    await db.ref(`driverAssignments/${driverUid}/${groomUid}`).set(true);
    // Refresh the driver's custom claim with the union of all groomUids they serve.
    const allAssigned = (await db.ref(`driverAssignments/${driverUid}`).get()).val() ?? {};
    const existingClaims = (await (0, auth_1.getAuth)().getUser(driverUid)).customClaims ?? {};
    await (0, auth_1.getAuth)().setCustomUserClaims(driverUid, {
        ...existingClaims,
        assignedGrooms: allAssigned,
    });
    await (0, audit_1.writeAudit)(driverUid, "assignDriverToGroom", { groomUid });
    return { groomUid, groomUsername };
});
//# sourceMappingURL=assignments.js.map