// Driver ↔ groom assignment endpoints.
//
//   GET  /assignments/:driverUid   driver (own uid) or admin: list assignments
//   POST /assignments              driver: pick a groom (writes the assignment
//                                  + re-stamps the `assignedGrooms` custom claim)
//
// Why a server endpoint instead of a direct RTDB write:
//   The `assignedGrooms` JWT claim is what Storage rules use to gate
//   proof-photo uploads. Only the Admin SDK can mint custom claims, so the
//   assignment write and the claim update must be done server-side together.
//
// What this file does NOT do:
//   - It does not allow admins to assign drivers (they can but it isn't
//     exposed yet). Drivers self-assign by passing a groom's username.

import { Router, Response } from "express";
import {
  AuthRequest,
  requireAuth,
  requireRole,
} from "../middleware/auth";
import { isUsername } from "../../helpers";
import { writeAudit } from "../../audit";
import { firebaseAssignmentStore } from "../../domain/assignments/firebaseAssignmentStore";

export const assignmentsRouter = Router();

// ─── GET /assignments/:driverUid ──────────────────────────────────────────────

/**
 * List the grooms a driver is currently assigned to. Returns an object
 * `{ [groomUid]: true }` (matches the underlying RTDB shape). Authorized
 * for the driver themselves and for admins.
 */
assignmentsRouter.get(
  "/:driverUid",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { driverUid } = req.params;
    const claims = req.caller!.claims;
    const isOwner = req.caller!.uid === driverUid;
    const isAdmin = claims.role === "admin";
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      res.json(await firebaseAssignmentStore().list(driverUid));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /assignments ────────────────────────────────────────────────────────

/**
 * Driver self-assignment to a groom. Body shape: `{ groomUsername }`.
 *
 * Steps (in order — any failure halts the chain so the claim never goes
 * out of sync with the RTDB assignment table):
 *   1. Resolve groomUsername → groomUid via /usernameIndex.
 *   2. Verify the resolved profile has role "groom".
 *   3. Write /driverAssignments/{driverUid}/{groomUid} = true.
 *   4. Compute the union of all this driver's assignments.
 *   5. Re-stamp the driver's `assignedGrooms` custom claim with that union.
 *   6. Audit-log the operation.
 *
 * Returns `{ groomUid, groomUsername }`.
 */
assignmentsRouter.post(
  "/",
  requireAuth,
  requireRole("driver"),
  async (req: AuthRequest, res: Response) => {
    const driverUid = req.caller!.uid;
    const groomUsername = (req.body?.groomUsername ?? "")
      .toString()
      .toLowerCase();
    if (!isUsername(groomUsername)) {
      res.status(400).json({ error: "invalid_groom_username" });
      return;
    }

    try {
      const result = await firebaseAssignmentStore().assign(driverUid, groomUsername);
      if (!result.ok) {
        if (result.reason === "unknown_groom") {
          res.status(404).json({ error: "unknown_groom" });
          return;
        }
        res.status(409).json({ error: "target_not_a_groom" });
        return;
      }
      const { groomUid } = result;
      await writeAudit(driverUid, "assignDriverToGroom", { groomUid });
      // Self-service assignment grants this driver read access to the groom's full
      // guest list (names/phones/addresses). Drivers are admin-provisioned and this
      // is an accepted-risk design, so emit a structured log line a Cloud Logging
      // metric/alert can watch for assignment bursts or cross-groom sprawl.
      // eslint-disable-next-line no-console
      console.info(
        "[security] driver_self_assignment",
        JSON.stringify({ driverUid, groomUid, groomUsername })
      );

      res.json({ groomUid, groomUsername });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// The assignment write + `assignedGrooms` claim restamp (and the compensating
// rollback that keeps them consistent) now live in the AssignmentStore domain
// module — see domain/assignments/assignmentStore.ts.

function errorMessage(err: unknown): string | undefined {
  // Public/admin 5xx responses must not echo raw error text in production — it
  // can leak Firestore paths / GCS bucket names. Suppressed by default; set
  // DAWA_DEBUG_ERRORS=1 (e.g. functions/.env.local) to see detail locally.
  if (process.env.DAWA_DEBUG_ERRORS !== "1") return undefined;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
