// Public People-gallery: OTP + guest-list gated access, then read.
//
//   POST /digital/gallery/:groomUsername/request-otp  { phoneE164, recaptchaToken }
//   POST /digital/gallery/:groomUsername/verify-otp   { sessionInfo, code }
//   GET  /digital/gallery/:groomUsername?galleryToken=…             people tiles
//   GET  /digital/gallery/:groomUsername/person/:clusterId?galleryToken=…  photos
//   GET  /digital/gallery/:groomUsername/person/:clusterId/zip?galleryToken=…
//
// Gate: the viewer enters their phone → must be in THIS wedding's guest list →
// receives an SMS code (reuses Firebase phone-OTP) → on verify we mint a short-
// lived gallery grant (RTDB, server-only) that authorizes the read endpoints.
// Every read also requires galleryConfig.enabled === true (admin kill-switch)
// AND galleryStatus === "approved". The whole gallery is private to invitees.

import { Router, Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ipRateLimit } from "../../middleware/rateLimit";
import { HOUR_MS } from "../../../constants/time";
import { normalisePhoneForMatching } from "../../../helpers";
import { safeDetail } from "./project";

const IDENTITY_TOOLKIT = "https://identitytoolkit.googleapis.com/v1/accounts";
const GRANT_TTL_MS = 24 * 60 * 60 * 1000;

function fs() { return getFirestore(); }
function db() { return getDatabase(); }
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function resolveUid(username: string): Promise<string | null> {
  if (!username) return null;
  for (const key of [username, username.toLowerCase()]) {
    const snap = await db().ref(`usernameIndex/${key}`).get();
    if (snap.exists()) return snap.val() as string;
  }
  return null;
}

async function readGalleryConfig(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await fs().doc(`digitalInvitations/${uid}/galleryConfig/config`).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

/** The gallery is publicly reachable only when enabled + approved. */
function galleryLive(cfg: Record<string, unknown> | null): boolean {
  return !!cfg && cfg.enabled === true && cfg.galleryStatus === "approved";
}

/** Is this phone in the wedding's guest list? Compares bare-digit forms. */
async function isMember(uid: string, phoneE164: string): Promise<boolean> {
  const target = normalisePhoneForMatching(phoneE164);
  if (!target) return false;
  const snap = await fs().collection(`digitalInvitations/${uid}/guests`).get();
  return snap.docs.some((d) => normalisePhoneForMatching(String(d.data().phone ?? "")) === target);
}

async function validateGrant(uid: string, galleryToken: string): Promise<boolean> {
  if (!galleryToken || !/^[a-f0-9]{32,64}$/.test(galleryToken)) return false;
  const snap = await db().ref(`galleryGrants/${uid}/${sha(galleryToken)}`).get();
  if (!snap.exists()) return false;
  const g = snap.val() as { expiresAt?: number };
  return typeof g.expiresAt === "number" && Date.now() < g.expiresAt;
}

/** Read the groom's approved default design for theme/name inheritance. */
async function inheritedDesign(uid: string): Promise<Record<string, unknown>> {
  const parent = await fs().doc(`digitalInvitations/${uid}`).get();
  const defaultId = parent.exists ? (parent.data()?.defaultDesignId as string) : "";
  let d: Record<string, unknown> = parent.exists ? (parent.data() as Record<string, unknown>) : {};
  if (defaultId) {
    const dSnap = await fs().doc(`digitalInvitations/${uid}/designs/${defaultId}`).get();
    if (dSnap.exists) d = dSnap.data() as Record<string, unknown>;
  }
  return {
    themeColor: d.themeColor ?? "gold",
    fontFamily: d.fontFamily ?? "amiri",
    brideName: d.brideName ?? "",
    groomDisplayName: d.groomDisplayName ?? "",
  };
}

export function registerGalleryAccessRoutes(router: Router): void {
  // ── request OTP ───────────────────────────────────────────────────────────
  router.post(
    "/gallery/:groomUsername/request-otp",
    ipRateLimit("galleryOtp", 8, HOUR_MS),
    async (req: Request, res: Response) => {
      const phoneE164 = String(req.body?.phoneE164 ?? "");
      const recaptchaToken = String(req.body?.recaptchaToken ?? "");
      if (!phoneE164 || !recaptchaToken) {
        res.status(400).json({ error: "missing_fields" });
        return;
      }
      try {
        const uid = await resolveUid(req.params.groomUsername);
        if (!uid || !galleryLive(await readGalleryConfig(uid))) {
          res.status(404).json({ error: "gallery_unavailable" });
          return;
        }
        // Members-only: do NOT spend an SMS on non-invitees.
        if (!(await isMember(uid, phoneE164))) {
          res.status(403).json({ error: "not_invited" });
          return;
        }
        const apiKey = process.env.WEB_API_KEY;
        if (!apiKey) { res.status(503).json({ error: "otp_unavailable" }); return; }
        const fbRes = await fetch(`${IDENTITY_TOOLKIT}:sendVerificationCode?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: phoneE164, recaptchaToken }),
        });
        const fbData = (await fbRes.json()) as { sessionInfo?: string };
        if (!fbRes.ok || !fbData.sessionInfo) {
          res.status(400).json({ error: "otp_failed" });
          return;
        }
        res.json({ sessionInfo: fbData.sessionInfo });
      } catch (err) {
        res.status(500).json({ error: "otp_failed", detail: safeDetail(err) });
      }
    },
  );

  // ── verify OTP → mint a gallery grant ─────────────────────────────────────
  router.post(
    "/gallery/:groomUsername/verify-otp",
    ipRateLimit("galleryVerify", 12, HOUR_MS),
    async (req: Request, res: Response) => {
      const sessionInfo = String(req.body?.sessionInfo ?? "");
      const code = String(req.body?.code ?? "");
      const consent = req.body?.consent;
      if (!sessionInfo || !code) { res.status(400).json({ error: "missing_fields" }); return; }
      // The viewer must affirm they understand the gallery uses face
      // recognition before we mint a grant that lets them browse matched faces.
      if (consent !== true && consent !== "true") {
        res.status(400).json({ error: "consent_required" });
        return;
      }
      try {
        const uid = await resolveUid(req.params.groomUsername);
        if (!uid || !galleryLive(await readGalleryConfig(uid))) {
          res.status(404).json({ error: "gallery_unavailable" });
          return;
        }
        const apiKey = process.env.WEB_API_KEY;
        if (!apiKey) { res.status(503).json({ error: "otp_unavailable" }); return; }
        const fbRes = await fetch(`${IDENTITY_TOOLKIT}:signInWithPhoneNumber?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionInfo, code }),
        });
        const fbData = (await fbRes.json()) as { phoneNumber?: string };
        if (!fbRes.ok || !fbData.phoneNumber) { res.status(400).json({ error: "bad_code" }); return; }
        // Re-check membership on the VERIFIED number.
        if (!(await isMember(uid, fbData.phoneNumber))) {
          res.status(403).json({ error: "not_invited" });
          return;
        }
        const galleryToken = randomBytes(24).toString("hex");
        const expiresAt = Date.now() + GRANT_TTL_MS;
        await db().ref(`galleryGrants/${uid}/${sha(galleryToken)}`).set({
          phoneE164: fbData.phoneNumber,
          expiresAt,
          consent: { biometric: true, version: "biometric-gallery-v1", at: Date.now() },
        });
        res.json({ galleryToken, expiresAt });
      } catch (err) {
        res.status(500).json({ error: "verify_failed", detail: safeDetail(err) });
      }
    },
  );

  // ── read: people tiles ────────────────────────────────────────────────────
  router.get("/gallery/:groomUsername", async (req: Request, res: Response) => {
    try {
      const uid = await resolveUid(req.params.groomUsername);
      const cfg = uid ? await readGalleryConfig(uid) : null;
      if (!uid || !galleryLive(cfg)) { res.status(404).json({ error: "gallery_unavailable" }); return; }
      if (!(await validateGrant(uid, String(req.query.galleryToken ?? "")))) {
        res.status(401).json({ error: "no_grant" });
        return;
      }
      const design = await inheritedDesign(uid);
      const clusters = await fs()
        .collection(`digitalInvitations/${uid}/peopleClusters`)
        .orderBy("photoCount", "desc")
        .get();
      const people = clusters.docs
        .filter((d) => !d.data().hidden)
        .map((d) => {
          const c = d.data();
          return {
            clusterId: d.id,
            rep: { url: c.rep?.url ?? null, box: c.rep?.box ?? null },
            photoCount: c.photoCount ?? 0,
            label: c.label ?? null,
          };
        });
      res.json({
        config: {
          title: cfg?.title ?? null,
          layout: cfg?.layout ?? "grid",
          coverPhoto: cfg?.coverPhoto ?? null,
          ...design,
        },
        people,
      });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  });

  // ── read: one person's photos ─────────────────────────────────────────────
  router.get("/gallery/:groomUsername/person/:clusterId", async (req: Request, res: Response) => {
    try {
      const uid = await resolveUid(req.params.groomUsername);
      if (!uid || !galleryLive(await readGalleryConfig(uid))) {
        res.status(404).json({ error: "gallery_unavailable" });
        return;
      }
      if (!(await validateGrant(uid, String(req.query.galleryToken ?? "")))) {
        res.status(401).json({ error: "no_grant" });
        return;
      }
      const photos = await personPhotos(uid, req.params.clusterId);
      res.json({ photos: photos.map((p) => ({ fileId: p.fileId, name: p.name, url: p.url })) });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  });

  // ── read: download one person's photos as a .zip ──────────────────────────
  router.get("/gallery/:groomUsername/person/:clusterId/zip", async (req: Request, res: Response) => {
    try {
      const uid = await resolveUid(req.params.groomUsername);
      if (!uid || !galleryLive(await readGalleryConfig(uid))) {
        res.status(404).json({ error: "gallery_unavailable" });
        return;
      }
      if (!(await validateGrant(uid, String(req.query.galleryToken ?? "")))) {
        res.status(401).json({ error: "no_grant" });
        return;
      }
      const photos = await personPhotos(uid, req.params.clusterId);
      if (!photos.length) { res.status(404).json({ error: "no_photos" }); return; }
      const archiver = (await import("archiver")).default;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="photos.zip"');
      const archive = archiver("zip", { store: true });
      archive.on("error", () => { try { if (!res.headersSent) res.status(500); res.end(); } catch { /* */ } });
      archive.pipe(res);
      const bucket = getStorage().bucket();
      let n = 0;
      for (const p of photos) {
        if (!p.storagePath) continue;
        const safe = `${String(n++).padStart(3, "0")}_${(p.name || "photo").replace(/[^\w.\-]+/g, "_")}`;
        archive.append(bucket.file(p.storagePath).createReadStream(), { name: safe });
      }
      await archive.finalize();
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: "zip_failed", detail: safeDetail(err) });
      else res.end();
    }
  });
}

/** A cluster's photos joined to photographer-file metadata (deduped by file). */
async function personPhotos(
  uid: string,
  clusterId: string,
): Promise<{ fileId: string; name: string; url: string; storagePath: string }[]> {
  const snap = await fs().doc(`digitalInvitations/${uid}/peopleClusters/${clusterId}`).get();
  if (!snap.exists || snap.data()?.hidden) return [];
  const fileIds = new Set(
    ((snap.data()?.members as { fileId?: string }[]) || []).map((m) => m.fileId).filter(Boolean) as string[],
  );
  if (!fileIds.size) return [];
  const filesSnap = await fs().collection(`digitalInvitations/${uid}/photographerFiles`).get();
  const out: { fileId: string; name: string; url: string; storagePath: string }[] = [];
  for (const d of filesSnap.docs) {
    if (!fileIds.has(d.id)) continue;
    const data = d.data();
    out.push({
      fileId: d.id,
      name: String(data.name ?? ""),
      url: String(data.url ?? ""),
      storagePath: String(data.storagePath ?? ""),
    });
  }
  return out;
}
