// Admin-only maintenance endpoints.
//
//   DELETE /admin/loadtest-data   admin (30/hr): purge ONLY load-test records
//
// This router exists to support the LOCAL load-test control dashboard. The
// dashboard's load-test personas stamp every record they create with a literal
// "LOADTEST" marker (e.g. guest/confirmation names start with "LOADTEST", the
// confirmation city is the literal "LOADTEST"). This endpoint deletes ONLY
// those marked records so a test run can be cleaned up without touching any
// real production data.
//
// SAFETY — this endpoint NEVER wipes whole nodes / collections. Every delete is
// gated on a marker check (`startsWith("LOADTEST")` / `=== "LOADTEST"`), built
// into a per-key multi-path update of nulls (RTDB) or a per-doc batched delete
// (Firestore). A record without the marker is left untouched.
//
// Authorization mirrors the other admin endpoints: requireAuth + requireAdmin
// (the role claim is checked before any DB access), plus a per-uid rate limit.

import { Router, Response } from "express";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { AuthRequest, requireAuth, requireAdmin } from "../middleware/auth";
import { uidRateLimit } from "../middleware/rateLimit";
import { HOUR_MS } from "../../constants/time";
import { COLL_ROOT, COLL_GUESTS } from "./digital/constants";

// ─── Constants ────────────────────────────────────────────────────────────────

/** The literal marker every load-test record carries on its identifying field. */
const LOADTEST_MARKER = "LOADTEST";

/**
 * Firestore range upper bound for a "startsWith(LOADTEST)" prefix query.
 * `` is a very high private-use code point, so an inclusive lower bound
 * of "LOADTEST" and an exclusive upper bound of "LOADTEST" selects every
 * string that begins with the marker.
 */
const LOADTEST_RANGE_END = `${LOADTEST_MARKER}`;

/** Wishes subcollection name (sibling of COLL_GUESTS under a groom doc). */
const COLL_WISHES = "wishes";

/** Max docs per Firestore batched write (Firestore hard limit is 500). */
const FIRESTORE_BATCH_LIMIT = 450;

/** Per-admin cap for the purge endpoint (matches other admin maintenance ops). */
const PURGE_MAX_PER_HOUR = 30;

export const adminRouter = Router();

// ─── DELETE /admin/loadtest-data ──────────────────────────────────────────────

interface DeletedCounts {
  confirmations: number;
  inviteTokens: number;
  guests: number;
  wishes: number;
}

/**
 * Purge ONLY load-test-marked records. Optional JSON body `{ groomUid?: string }`
 * scopes the Firestore guest/wish deletes to one groom (the RTDB confirmation /
 * invite-token deletes are global because those nodes are not partitioned by
 * groom in a way the marker query can exploit).
 *
 * Steps (each reported independently so a partial failure surfaces the counts
 * achieved before the failing step):
 *   a) RTDB /confirmations/{id} where submittedName startsWith "LOADTEST"
 *      OR submittedCity === "LOADTEST".
 *   b) RTDB /inviteTokens/{token} where guestName startsWith "LOADTEST".
 *   c) Firestore {COLL_ROOT}/{groomUid}/guests where name in
 *      ["LOADTEST", "LOADTEST")  (only when groomUid is provided).
 *   d) Firestore {COLL_ROOT}/{groomUid}/wishes where who OR what
 *      startsWith "LOADTEST"  (only when groomUid is provided).
 *
 * Success 200: { ok: true, deleted: { confirmations, inviteTokens, guests, wishes } }
 * Step failure 500: { error: "purge_failed", failedStep, detail, deleted: <partial> }
 */
adminRouter.delete(
  "/loadtest-data",
  requireAuth,
  requireAdmin,
  uidRateLimit("loadtestPurge", PURGE_MAX_PER_HOUR, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const groomUid = parseGroomUid(req.body);

    const deleted: DeletedCounts = {
      confirmations: 0,
      inviteTokens: 0,
      guests: 0,
      wishes: 0,
    };

    let step: keyof DeletedCounts = "confirmations";
    try {
      // (a) RTDB confirmations.
      step = "confirmations";
      deleted.confirmations = await purgeConfirmations();

      // (b) RTDB invite tokens.
      step = "inviteTokens";
      deleted.inviteTokens = await purgeInviteTokens();

      // (c) + (d) Firestore guests + wishes — only scoped to a groom.
      if (groomUid) {
        step = "guests";
        deleted.guests = await purgeGuests(groomUid);

        step = "wishes";
        deleted.wishes = await purgeWishes(groomUid);
      }

      res.json({ ok: true, deleted });
    } catch (err) {
      res.status(500).json({
        error: "purge_failed",
        failedStep: step,
        detail: errorMessage(err),
        deleted,
      });
    }
  }
);

// ─── Step (a): RTDB /confirmations ────────────────────────────────────────────

/**
 * Delete every /confirmations/{id} whose `submittedName` starts with the
 * marker OR whose `submittedCity` is exactly the marker. Reads the node once,
 * builds a single multi-path update of `{ "confirmations/<id>": null, ... }`,
 * and applies it atomically. Returns the number of records removed.
 *
 * Covers BOTH the public LandingConfirmer posts (which set submittedName /
 * submittedCity directly) AND the digital-submit mirror at /confirmations/
 * dg_{guestId} (whose submittedName is the marked guest name).
 */
async function purgeConfirmations(): Promise<number> {
  const db = getDatabase();
  const snap = await db.ref("confirmations").get();
  if (!snap.exists()) return 0;

  const updates: Record<string, null> = {};
  snap.forEach((child) => {
    const id = child.key;
    if (!id) return;
    const v = child.val() as
      | { submittedName?: unknown; submittedCity?: unknown }
      | null;
    if (!v) return;
    const nameMatch = String(v.submittedName ?? "").startsWith(LOADTEST_MARKER);
    const cityMatch = v.submittedCity === LOADTEST_MARKER;
    if (nameMatch || cityMatch) {
      updates[`confirmations/${id}`] = null;
    }
  });

  const count = Object.keys(updates).length;
  if (count > 0) await db.ref().update(updates);
  return count;
}

// ─── Step (b): RTDB /inviteTokens ─────────────────────────────────────────────

/**
 * Delete every /inviteTokens/{token} whose `guestName` starts with the marker.
 * Same multi-path-null strategy as the confirmations step.
 */
async function purgeInviteTokens(): Promise<number> {
  const db = getDatabase();
  const snap = await db.ref("inviteTokens").get();
  if (!snap.exists()) return 0;

  const updates: Record<string, null> = {};
  snap.forEach((child) => {
    const token = child.key;
    if (!token) return;
    const v = child.val() as { guestName?: unknown } | null;
    if (!v) return;
    if (String(v.guestName ?? "").startsWith(LOADTEST_MARKER)) {
      updates[`inviteTokens/${token}`] = null;
    }
  });

  const count = Object.keys(updates).length;
  if (count > 0) await db.ref().update(updates);
  return count;
}

// ─── Step (c): Firestore guests ───────────────────────────────────────────────

/**
 * Delete every Firestore {COLL_ROOT}/{groomUid}/guests doc whose `name` falls
 * in the marker prefix range. Deleting the doc removes its RSVP fields too.
 * Uses batched writes (capped at FIRESTORE_BATCH_LIMIT per batch).
 */
async function purgeGuests(groomUid: string): Promise<number> {
  const fs = getFirestore();
  const query = fs
    .collection(`${COLL_ROOT}/${groomUid}/${COLL_GUESTS}`)
    .where("name", ">=", LOADTEST_MARKER)
    .where("name", "<", LOADTEST_RANGE_END);
  const snap = await query.get();
  return deleteDocsInBatches(snap.docs);
}

// ─── Step (d): Firestore wishes ───────────────────────────────────────────────

/**
 * Delete every Firestore {COLL_ROOT}/{groomUid}/wishes doc whose `who` OR
 * `what` starts with the marker. Wishes carry no single rangeable marker field
 * (either side may be marked), so we read the collection and filter in memory
 * rather than running a range query.
 */
async function purgeWishes(groomUid: string): Promise<number> {
  const fs = getFirestore();
  const snap = await fs
    .collection(`${COLL_ROOT}/${groomUid}/${COLL_WISHES}`)
    .get();
  const matches = snap.docs.filter((d) => {
    const data = d.data() as { who?: unknown; what?: unknown };
    return (
      String(data.who ?? "").startsWith(LOADTEST_MARKER) ||
      String(data.what ?? "").startsWith(LOADTEST_MARKER)
    );
  });
  return deleteDocsInBatches(matches);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Delete the given Firestore docs in batches of FIRESTORE_BATCH_LIMIT.
 * Returns the number of docs deleted.
 */
async function deleteDocsInBatches(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<number> {
  const fs = getFirestore();
  let deleted = 0;
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const slice = docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = fs.batch();
    for (const doc of slice) batch.delete(doc.ref);
    await batch.commit();
    deleted += slice.length;
  }
  return deleted;
}

/**
 * Extract an optional `groomUid` string from the request body. Returns the
 * trimmed string when present and non-empty, otherwise `null`.
 */
function parseGroomUid(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const v = (body as Record<string, unknown>).groomUid;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Best-effort error-to-string conversion for JSON error responses. Never
 * returns a stack trace; only the human-readable text.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
