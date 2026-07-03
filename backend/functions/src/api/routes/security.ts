// Admin Security page endpoints — the monitor/filter + block/unblock surface.
//
//   GET  /admin/security/events    admin: list security events (filterable)
//   GET  /admin/security/summary   admin: counts for the dashboard + nav badge
//   GET  /admin/security/blocks    admin: current account/IP/fingerprint blocks
//   POST /admin/security/block     admin: block an account / IP / fingerprint
//   POST /admin/security/unblock   admin: lift a block
//   POST /admin/security/events/:id/resolve  admin: mark an event handled
//
// Events are stored in Firestore `securityEvents` (securityEvents.ts). To avoid
// requiring composite indexes, reads fetch the most-recent slice ordered by ts
// and apply type/severity/resolved filters in memory.
//
// ACCOUNT BLOCK teardown: blocking an account also disables the Firebase Auth
// user and revokes their refresh tokens, so any live session dies at the next
// verifyIdToken (checkRevoked:true). Unblock re-enables the user.

import { Router, Response } from "express";
import { z } from "zod";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { AuthRequest, requireAuth, requireAdmin } from "../middleware/auth";
import { uidRateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import {
  SECURITY_EVENTS_COLLECTION,
  recordSecurityEvent,
} from "../../securityEvents";
import {
  listBlocks,
  setBlock,
  removeBlock,
  BlockKind,
} from "../../blockList";
import { ipKey } from "../clientMeta";
import { writeAudit } from "../../audit";
import { errorMessage } from "../errorDetail";

export const securityRouter = Router();

/** How many recent events to scan before applying in-memory filters. */
const EVENT_SCAN_CAP = 1000;

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

// ─── GET /admin/security/events ───────────────────────────────────────────────

const eventsQuery = z.object({
  type: z.string().trim().max(64).optional(),
  severity: z.enum(SEVERITIES).optional(),
  resolved: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).catch(200),
});

securityRouter.get(
  "/events",
  requireAuth,
  requireAdmin,
  uidRateLimit("secEvents", RATE.SECURITY_READ_PER_ADMIN.limit, HOUR_MS),
  validate({ query: eventsQuery }),
  async (req: AuthRequest, res: Response) => {
    try {
      const q = req.query as unknown as z.infer<typeof eventsQuery>;
      const snap = await getFirestore()
        .collection(SECURITY_EVENTS_COLLECTION)
        .orderBy("ts", "desc")
        .limit(EVENT_SCAN_CAP)
        .get();

      let rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }));
      rows = rows.filter((r: Record<string, unknown>) => {
        if (q.type && r.type !== q.type) return false;
        if (q.severity && r.severity !== q.severity) return false;
        if (q.resolved === "true" && r.resolved !== true) return false;
        if (q.resolved === "false" && r.resolved === true) return false;
        return true;
      });
      res.json(rows.slice(0, q.limit));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

// ─── GET /admin/security/summary ──────────────────────────────────────────────

securityRouter.get(
  "/summary",
  requireAuth,
  requireAdmin,
  uidRateLimit("secSummary", RATE.SECURITY_READ_PER_ADMIN.limit, HOUR_MS),
  async (_req: AuthRequest, res: Response) => {
    try {
      const snap = await getFirestore()
        .collection(SECURITY_EVENTS_COLLECTION)
        .orderBy("ts", "desc")
        .limit(EVENT_SCAN_CAP)
        .get();

      const bySeverity: Record<string, number> = {};
      let unresolved = 0;
      snap.docs.forEach((d) => {
        const v = d.data() as { severity?: string; resolved?: boolean };
        const sev = v.severity ?? "info";
        bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
        if (v.resolved !== true) unresolved += 1;
      });

      const blocks = await listBlocks();
      res.json({
        total: snap.size,
        unresolved,
        bySeverity,
        blockedCounts: {
          accounts: Object.keys(blocks.accounts).length,
          ips: Object.keys(blocks.ips).length,
          fingerprints: Object.keys(blocks.fingerprints).length,
        },
      });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

// ─── GET /admin/security/blocks ───────────────────────────────────────────────

securityRouter.get(
  "/blocks",
  requireAuth,
  requireAdmin,
  uidRateLimit("secBlocks", RATE.SECURITY_READ_PER_ADMIN.limit, HOUR_MS),
  async (_req: AuthRequest, res: Response) => {
    try {
      res.json(await listBlocks());
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /admin/security/block ───────────────────────────────────────────────

const blockBody = z.object({
  kind: z.enum(["account", "ip", "fingerprint"]),
  value: z.string().trim().min(1).max(256),
  reason: z.string().trim().max(500).optional(),
  // 1 minute .. 30 days; omit for a permanent block.
  durationMs: z.coerce.number().int().min(60_000).max(2_592_000_000).optional(),
});

securityRouter.post(
  "/block",
  requireAuth,
  requireAdmin,
  uidRateLimit("secBlock", RATE.SECURITY_ACTION_PER_ADMIN.limit, HOUR_MS),
  validate({ body: blockBody }),
  async (req: AuthRequest, res: Response) => {
    const { kind, value, reason, durationMs } = req.body as z.infer<
      typeof blockBody
    >;
    const adminUid = req.caller!.uid;
    const key = kind === "ip" ? ipKey(value) : value;
    const expiresAt = durationMs ? Date.now() + durationMs : null;

    try {
      // Account blocks: authoritative teardown via Firebase Auth.
      if (kind === "account") {
        try {
          await getAuth().updateUser(value, { disabled: true });
          await getAuth().revokeRefreshTokens(value);
        } catch (authErr) {
          const code =
            authErr && typeof authErr === "object" && "code" in authErr
              ? String((authErr as { code: unknown }).code)
              : "";
          if (code === "auth/user-not-found") {
            res.status(404).json({ error: "user_not_found" });
            return;
          }
          throw authErr;
        }
      }

      await setBlock(kind as BlockKind, key, {
        reason,
        by: adminUid,
        ts: Date.now(),
        expiresAt,
        value,
      });

      recordSecurityEvent("manual_block", req, {
        actorUid: adminUid,
        detail: { kind, key, expiresAt },
      });
      await writeAudit(adminUid, "security.block", { kind, key, expiresAt });

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "block_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /admin/security/unblock ─────────────────────────────────────────────

const unblockBody = z.object({
  kind: z.enum(["account", "ip", "fingerprint"]),
  value: z.string().trim().min(1).max(256),
});

securityRouter.post(
  "/unblock",
  requireAuth,
  requireAdmin,
  uidRateLimit("secUnblock", RATE.SECURITY_ACTION_PER_ADMIN.limit, HOUR_MS),
  validate({ body: unblockBody }),
  async (req: AuthRequest, res: Response) => {
    const { kind, value } = req.body as z.infer<typeof unblockBody>;
    const adminUid = req.caller!.uid;
    const key = kind === "ip" ? ipKey(value) : value;

    try {
      if (kind === "account") {
        try {
          await getAuth().updateUser(value, { disabled: false });
        } catch (authErr) {
          const code =
            authErr && typeof authErr === "object" && "code" in authErr
              ? String((authErr as { code: unknown }).code)
              : "";
          // A missing user just means nothing to re-enable; still clear the list.
          if (code !== "auth/user-not-found") throw authErr;
        }
      }

      await removeBlock(kind as BlockKind, key);

      recordSecurityEvent("manual_unblock", req, {
        actorUid: adminUid,
        detail: { kind, key },
      });
      await writeAudit(adminUid, "security.unblock", { kind, key });

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "unblock_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /admin/security/events/:id/resolve ──────────────────────────────────

const resolveParams = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});

securityRouter.post(
  "/events/:id/resolve",
  requireAuth,
  requireAdmin,
  uidRateLimit("secResolve", RATE.SECURITY_ACTION_PER_ADMIN.limit, HOUR_MS),
  validate({ params: resolveParams }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params as z.infer<typeof resolveParams>;
      const ref = getFirestore().collection(SECURITY_EVENTS_COLLECTION).doc(id);
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await ref.update({ resolved: true, resolvedBy: req.caller!.uid, resolvedAt: Date.now() });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);
