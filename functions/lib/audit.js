"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAudit = writeAudit;
// Append-only audit log of admin / privileged actions, written via the
// Admin SDK (which bypasses security rules — but rules still block direct
// client reads/writes against /audit).
const database_1 = require("firebase-admin/database");
async function writeAudit(uid, action, details) {
    try {
        await (0, database_1.getDatabase)().ref("audit").push({
            uid,
            action,
            details: details ?? null,
            timestamp: Date.now(),
        });
    }
    catch (err) {
        // Never let audit-log failure break the caller; just log it.
        console.error("audit.writeAudit failed", err);
    }
}
//# sourceMappingURL=audit.js.map