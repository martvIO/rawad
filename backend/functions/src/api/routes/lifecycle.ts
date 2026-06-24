// Groom-account (wedding) lifecycle endpoints.
//
// A "wedding" is a groom account, so its lifecycle (cancel / postpone / restore)
// is modelled as a status field on /users/{uid}. Two audiences:
//
//   GROOM (self-serve, `requireRole("groom")` — always acts on req.caller.uid):
//     GET  /lifecycle/me                 read my own status block
//     POST /lifecycle/cancel             active|paused → cancel_pending (grace)
//     POST /lifecycle/cancel/undo        cancel_pending → active (within grace)
//     POST /lifecycle/pause              active → paused (optional new date)
//     POST /lifecycle/resume             paused → active
//
//   ADMIN (`requireAdmin`):
//     GET  /lifecycle/pending            inbox: every non-active account
//     POST /lifecycle/:uid/confirm-cancel  cancel_pending → cancelled (now)
//     POST /lifecycle/:uid/restore       any frozen → active
//
//   PUBLIC (no auth) — drives the guest-facing notice on /confirm/:username:
//     GET  /lifecycle/public/:username   { available, state }
//
// All Firebase access goes through the same data-access seam routes/users.ts
// uses (api/stores/userStore), so the transition handlers are unit-testable via
// the in-memory adapter with no emulator. The two best-effort side reads
// (grace-hours from adminSettings, the admin WhatsApp ping) are guarded so they
// no-op safely in that env. The PUBLIC freeze of guest pages is enforced
// separately at the read/write endpoints (see lifecycle/gate.ts).

import { Router, Request, Response } from "express";
import { getDatabase } from "firebase-admin/database";
import { writeAudit } from "../../audit";
import {
  AuthRequest,
  requireAuth,
  requireAdmin,
  requireRole,
} from "../middleware/auth";
import { userStore } from "../stores/userStore";
import { sendWhatsAppText } from "../../whatsapp";
import { getWhatsAppConfig, isConfigured } from "../../whatsappConfig";
import {
  LIFECYCLE,
  DEFAULT_CANCEL_GRACE_HOURS,
  MAX_CANCEL_REASON_LEN,
  clampGraceHours,
  graceEndsAt,
  normalizeStatus,
  publicEventState,
} from "../../lifecycle/status";
import { isUsername } from "../../helpers";
import { errorMessage } from "../errorDetail";

export const lifecycleRouter = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

/** The status-block fields surfaced to the groom and the admin inbox. */
const STATUS_FIELDS = [
  "lifecycleStatus",
  "cancelRequestedAt",
  "cancelGraceEndsAt",
  "cancelReason",
  "cancelledAt",
  "pausedAt",
  "pausedNewDate",
] as const;

function statusBlock(profile: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {
    lifecycleStatus: normalizeStatus(profile?.lifecycleStatus),
  };
  for (const f of STATUS_FIELDS) {
    if (f === "lifecycleStatus") continue;
    if (profile && profile[f] !== undefined && profile[f] !== null) out[f] = profile[f];
  }
  return out;
}

/** Admin-configured grace window (hours). Best-effort; default on any error so
 *  the handler stays unit-testable (getDatabase throws in the no-Firebase env). */
async function readCancelGraceHours(): Promise<number> {
  try {
    const snap = await getDatabase().ref("adminSettings/cancelGraceHours").get();
    return clampGraceHours(snap.exists() ? snap.val() : DEFAULT_CANCEL_GRACE_HOURS);
  } catch {
    return DEFAULT_CANCEL_GRACE_HOURS;
  }
}

/** Best-effort WhatsApp ping to the admin contact number. No-op (no DB touch)
 *  unless WhatsApp is actually configured, so it is inert in unit tests. */
async function pingAdmin(text: string): Promise<void> {
  const cfg = await getWhatsAppConfig();
  if (!isConfigured(cfg)) return;
  try {
    const snap = await getDatabase().ref("adminSettings/contactWhatsapp").get();
    const num = snap.val();
    if (typeof num === "string" && num.trim()) {
      await sendWhatsAppText(num, text, { token: cfg.token, phoneId: cfg.phoneId });
    }
  } catch {
    /* notification is best-effort — never block the transition */
  }
}

function clampReason(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, MAX_CANCEL_REASON_LEN);
  return t.length > 0 ? t : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// GROOM self-serve  (literal paths declared before the admin "/:uid/*" routes)
// ═══════════════════════════════════════════════════════════════════════════

/** GET /lifecycle/me — the caller's own status block (any authenticated user). */
lifecycleRouter.get(
  "/me",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const profile = await userStore.readUser(req.caller!.uid);
      res.json(statusBlock(profile));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  },
);

/**
 * POST /lifecycle/cancel — groom requests cancellation.
 * active|paused → cancel_pending. Freezes public pages immediately (via the
 * status gate) while the groom portal stays editable so they can undo within
 * the grace window. Pings the admin.
 */
lifecycleRouter.post(
  "/cancel",
  requireAuth,
  requireRole("groom"),
  async (req: AuthRequest, res: Response) => {
    const uid = req.caller!.uid;
    try {
      const profile = await userStore.readUser(uid);
      if (profile === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const cur = normalizeStatus(profile.lifecycleStatus);
      if (cur === LIFECYCLE.CANCEL_PENDING) {
        res.status(409).json({ error: "already_pending" });
        return;
      }
      if (cur === LIFECYCLE.CANCELLED) {
        res.status(409).json({ error: "already_cancelled" });
        return;
      }

      const now = Date.now();
      const graceHours = await readCancelGraceHours();
      const cancelGraceEnds = graceEndsAt(now, graceHours);
      await userStore.patchUserFields(uid, {
        lifecycleStatus: LIFECYCLE.CANCEL_PENDING,
        cancelRequestedAt: now,
        cancelGraceEndsAt: cancelGraceEnds,
        cancelReason: clampReason(req.body?.reason),
        statusUpdatedBy: uid,
        // Clear any stale paused fields if cancelling straight from paused.
        pausedAt: null,
        pausedNewDate: null,
        cancelledAt: null,
      });
      await writeAudit(uid, "requestWeddingCancellation", {
        cancelGraceEndsAt: cancelGraceEnds,
      });
      await pingAdmin(
        `طلب عريس إلغاء حفل زفافه (uid ${uid}). تنتهي مهلة التراجع: ` +
          new Date(cancelGraceEnds).toISOString(),
      );
      res.json({
        ok: true,
        lifecycleStatus: LIFECYCLE.CANCEL_PENDING,
        cancelGraceEndsAt: cancelGraceEnds,
      });
    } catch (err) {
      res.status(500).json({ error: "cancel_failed", detail: errorMessage(err) });
    }
  },
);

/** POST /lifecycle/cancel/undo — groom reverses a pending cancellation. */
lifecycleRouter.post(
  "/cancel/undo",
  requireAuth,
  requireRole("groom"),
  async (req: AuthRequest, res: Response) => {
    const uid = req.caller!.uid;
    try {
      const profile = await userStore.readUser(uid);
      if (profile === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (normalizeStatus(profile.lifecycleStatus) !== LIFECYCLE.CANCEL_PENDING) {
        res.status(409).json({ error: "not_pending" });
        return;
      }
      await userStore.patchUserFields(uid, {
        lifecycleStatus: LIFECYCLE.ACTIVE,
        cancelRequestedAt: null,
        cancelGraceEndsAt: null,
        cancelReason: null,
        statusUpdatedBy: uid,
      });
      await writeAudit(uid, "undoWeddingCancellation", {});
      res.json({ ok: true, lifecycleStatus: LIFECYCLE.ACTIVE });
    } catch (err) {
      res.status(500).json({ error: "undo_failed", detail: errorMessage(err) });
    }
  },
);

/** POST /lifecycle/pause — groom postpones (temporary freeze, optional new date). */
lifecycleRouter.post(
  "/pause",
  requireAuth,
  requireRole("groom"),
  async (req: AuthRequest, res: Response) => {
    const uid = req.caller!.uid;
    const rawDate = req.body?.newDate;
    let pausedNewDate: number | null = null;
    if (rawDate !== undefined && rawDate !== null && rawDate !== "") {
      const n = Number(rawDate);
      if (!Number.isFinite(n) || n <= 0) {
        res.status(400).json({ error: "invalid_date" });
        return;
      }
      pausedNewDate = n;
    }
    try {
      const profile = await userStore.readUser(uid);
      if (profile === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (normalizeStatus(profile.lifecycleStatus) !== LIFECYCLE.ACTIVE) {
        res.status(409).json({ error: "not_active" });
        return;
      }
      await userStore.patchUserFields(uid, {
        lifecycleStatus: LIFECYCLE.PAUSED,
        pausedAt: Date.now(),
        pausedNewDate,
        statusUpdatedBy: uid,
      });
      await writeAudit(uid, "pauseWedding", { pausedNewDate });
      res.json({ ok: true, lifecycleStatus: LIFECYCLE.PAUSED });
    } catch (err) {
      res.status(500).json({ error: "pause_failed", detail: errorMessage(err) });
    }
  },
);

/** POST /lifecycle/resume — groom lifts a postpone. */
lifecycleRouter.post(
  "/resume",
  requireAuth,
  requireRole("groom"),
  async (req: AuthRequest, res: Response) => {
    const uid = req.caller!.uid;
    try {
      const profile = await userStore.readUser(uid);
      if (profile === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (normalizeStatus(profile.lifecycleStatus) !== LIFECYCLE.PAUSED) {
        res.status(409).json({ error: "not_paused" });
        return;
      }
      await userStore.patchUserFields(uid, {
        lifecycleStatus: LIFECYCLE.ACTIVE,
        pausedAt: null,
        pausedNewDate: null,
        statusUpdatedBy: uid,
      });
      await writeAudit(uid, "resumeWedding", {});
      res.json({ ok: true, lifecycleStatus: LIFECYCLE.ACTIVE });
    } catch (err) {
      res.status(500).json({ error: "resume_failed", detail: errorMessage(err) });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC — guest-facing availability (no auth)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /lifecycle/public/:username — resolve a groom username to the guest-facing
 * event state so the /confirm/:username form can show a cancelled/postponed
 * notice on load. Resolves via the same seam (readUsernameOwner → readUser); no
 * internal fields are exposed.
 */
lifecycleRouter.get(
  "/public/:username",
  async (req: Request, res: Response) => {
    const username = (req.params.username ?? "").toString().toLowerCase();
    if (!isUsername(username)) {
      res.status(400).json({ error: "invalid_groom" });
      return;
    }
    try {
      const uid = await userStore.readUsernameOwner(username);
      if (!uid) {
        res.status(404).json({ error: "unknown_groom" });
        return;
      }
      const profile = await userStore.readUser(uid);
      const state = publicEventState(profile?.lifecycleStatus);
      res.set("Cache-Control", "no-store");
      res.json({
        available: state === "active",
        state,
        pausedNewDate:
          state === "postponed" && typeof profile?.pausedNewDate === "number"
            ? profile.pausedNewDate
            : null,
      });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════════════

/** GET /lifecycle/pending — every non-active account (the admin inbox). */
lifecycleRouter.get(
  "/pending",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const users = await userStore.listUsers();
      const rows = users
        .filter((u) => normalizeStatus(u.lifecycleStatus) !== LIFECYCLE.ACTIVE)
        .map((u) => ({
          uid: u.uid,
          username: u.username,
          displayName: u.displayName ?? null,
          role: u.role,
          ...statusBlock(u as Record<string, unknown>),
        }));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  },
);

/** POST /lifecycle/:uid/confirm-cancel — admin finalises a pending cancellation now. */
lifecycleRouter.post(
  "/:uid/confirm-cancel",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    try {
      const profile = await userStore.readUser(uid);
      if (profile === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (normalizeStatus(profile.lifecycleStatus) !== LIFECYCLE.CANCEL_PENDING) {
        res.status(409).json({ error: "not_pending" });
        return;
      }
      await userStore.patchUserFields(uid, {
        lifecycleStatus: LIFECYCLE.CANCELLED,
        cancelledAt: Date.now(),
        statusUpdatedBy: req.caller!.uid,
      });
      await writeAudit(req.caller!.uid, "confirmWeddingCancellation", { uid });
      res.json({ ok: true, lifecycleStatus: LIFECYCLE.CANCELLED });
    } catch (err) {
      res.status(500).json({ error: "confirm_failed", detail: errorMessage(err) });
    }
  },
);

/** POST /lifecycle/:uid/restore — admin returns any frozen account to active. */
lifecycleRouter.post(
  "/:uid/restore",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    try {
      const profile = await userStore.readUser(uid);
      if (profile === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (normalizeStatus(profile.lifecycleStatus) === LIFECYCLE.ACTIVE) {
        res.status(409).json({ error: "already_active" });
        return;
      }
      await userStore.patchUserFields(uid, {
        lifecycleStatus: LIFECYCLE.ACTIVE,
        cancelRequestedAt: null,
        cancelGraceEndsAt: null,
        cancelReason: null,
        cancelledAt: null,
        pausedAt: null,
        pausedNewDate: null,
        statusUpdatedBy: req.caller!.uid,
      });
      await writeAudit(req.caller!.uid, "restoreWedding", { uid });
      res.json({ ok: true, lifecycleStatus: LIFECYCLE.ACTIVE });
    } catch (err) {
      res.status(500).json({ error: "restore_failed", detail: errorMessage(err) });
    }
  },
);
