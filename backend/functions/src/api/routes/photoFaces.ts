// Guest face-enrollment + photo-matching endpoints (PUBLIC, token-based).
//
//   POST   /digital/photos/liveness/session  start an AWS Face Liveness session
//   POST   /digital/photos/enroll            enroll a selfie (upload OR liveness)
//   GET    /digital/photos/matches?token=…   enrollment state + matched photos
//   DELETE /digital/photos/enroll            erase the guest's face data
//   GET    /digital/photos/zip?token=…       stream matched photos as a .zip
//
// Mounted at /digital/photos BEFORE the digital router so its ":uid" params
// can never capture the literal "photos" segment.
//
// Engine: AWS Rekognition. The invite token is the credential (the server
// resolves groomUid from it; never exposed to the client). The guest's selfie
// is sent to the server and to Rekognition — the consent screen says so — and
// only the resulting FaceId is stored in Firestore (guestFaces). The face row
// carries expireAt = the token's expiry; a Firestore TTL policy garbage-
// collects it, and DELETE /enroll erases both the AWS face and the row.
//
// SEAM NOTE: unlike the digital CRUD routers (guests/wishes/designs/workflow,
// now behind FirestorePort), this route DELIBERATELY stays on direct SDK calls.
// Its work is AWS Rekognition (liveness/enroll/search) + Cloud Storage (zip
// streaming) + multipart parsing, with only incidental Firestore reads — routing
// it through a Firestore port would abstract the wrong layer. The same call
// applies to the other Storage/AWS/WhatsApp routers (digital media, gallery,
// photographer, photoShare, galleryAccess): their adapter calls are intentional.

import { Router, Request, Response } from "express";
import { getDatabase } from "firebase-admin/database";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { tokenRateLimit } from "../middleware/rateLimit";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { TOKEN_HEX_RE } from "../../constants/tokens";
import { normalisePhone } from "../../helpers";
import { isRekognitionConfigured } from "../../faceIndex/config";
import { joinRekognitionMatches, hashToken, PhotoFileRow, PhotoMatch } from "../../faceIndex/match";
import { parseMultipart } from "./digital/storage";

/** Selfie upload cap (downscaled to ≤5 MB before Rekognition). */
const MAX_SELFIE_BYTES = 15 * 1024 * 1024;
/** Minimum AWS Face Liveness confidence (0..100) to accept a camera capture. */
const LIVENESS_MIN_CONFIDENCE = 75;

const enrollLimiter = tokenRateLimit(
  "photoEnroll",
  RATE.PHOTO_ENROLL_PER_TOKEN.limit,
  HOUR_MS,
  RATE.PHOTO_ENROLL_IP_BACKSTOP.limit,
);
const matchesLimiter = tokenRateLimit(
  "photoMatches",
  RATE.PHOTO_MATCHES_PER_TOKEN.limit,
  HOUR_MS,
  RATE.PHOTO_MATCHES_IP_BACKSTOP.limit,
);

export const photoFacesRouter = Router();

// ─── POST /digital/photos/liveness/session ───────────────────────────────────

/** Start a Face Liveness session for the camera path. Body: `{ token }`. */
photoFacesRouter.post("/liveness/session", enrollLimiter, async (req: Request, res: Response) => {
  const token = (req.query?.token ?? req.body?.token ?? "").toString();
  const tk = await loadValidToken(token, res);
  if (!tk) return;
  if (!isRekognitionConfigured()) {
    res.status(503).json({ error: "face_engine_unavailable" });
    return;
  }
  try {
    const rek = await import("../../faceIndex/rekognition.js");
    const sessionId = await rek.createLivenessSession();
    if (!sessionId) {
      res.status(502).json({ error: "liveness_unavailable" });
      return;
    }
    res.json({ sessionId, region: process.env.AWS_REGION ?? null });
  } catch (err) {
    res.status(500).json({ error: "liveness_failed", detail: errorMessage(err) });
  }
});

// ─── POST /digital/photos/enroll ─────────────────────────────────────────────

/**
 * Enroll the guest's selfie and return their first matches. Two input modes:
 *   - multipart/form-data with an image file (upload path; token in ?query),
 *   - JSON `{ token, phone, livenessSessionId }` (camera path; the verified
 *     Liveness reference image is fetched from AWS).
 * The selfie is processed only to extract a FaceId; the image is not stored.
 */
photoFacesRouter.post("/enroll", enrollLimiter, async (req: Request, res: Response) => {
  if (!isRekognitionConfigured()) {
    res.status(503).json({ error: "face_engine_unavailable" });
    return;
  }
  const contentType = String(req.headers["content-type"] ?? "");

  let token = (req.query?.token ?? "").toString();
  let phone: string | undefined;
  let livenessSessionId: string | undefined;
  let uploadedBytes: Buffer | null = null;

  try {
    if (contentType.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, MAX_SELFIE_BYTES);
      token = token || (parsed.fields.token ?? "");
      phone = parsed.fields.phone;
      livenessSessionId = parsed.fields.livenessSessionId;
      if (parsed.file && !parsed.file.truncated && parsed.file.buffer.length) {
        uploadedBytes = parsed.file.buffer;
      } else if (parsed.file?.truncated) {
        res.status(413).json({ error: "image_too_large" });
        return;
      }
    } else {
      token = token || (req.body?.token ?? "").toString();
      phone = req.body?.phone;
      livenessSessionId = req.body?.livenessSessionId;
    }
  } catch {
    res.status(400).json({ error: "invalid_multipart" });
    return;
  }

  const tk = await loadValidToken(token, res);
  if (!tk) return;

  try {
    if (!(await isPhotographerPublished(tk.groomUid))) {
      res.status(409).json({ error: "not_published" });
      return;
    }

    const rek = await import("../../faceIndex/rekognition.js");

    // Resolve the selfie bytes: uploaded image, or the Liveness reference image.
    let bytes = uploadedBytes;
    if (!bytes && livenessSessionId) {
      const result = await rek.getLivenessResults(String(livenessSessionId));
      if (result.status !== "SUCCEEDED" || result.confidence < LIVENESS_MIN_CONFIDENCE || !result.referenceImage) {
        res.status(422).json({ error: "liveness_failed" });
        return;
      }
      bytes = result.referenceImage;
    }
    if (!bytes) {
      res.status(400).json({ error: "no_image" });
      return;
    }

    // Re-enroll: drop the guest's previous AWS face so it doesn't linger.
    const ref = guestFaceDoc(tk.groomUid, token);
    const prior = await ref.get();
    const priorFaceId = prior.exists ? (prior.data()?.faceId as string | undefined) : undefined;
    if (priorFaceId) await rek.deleteFaces(tk.groomUid, [priorFaceId]).catch(() => undefined);

    const guestId = tk.guestId || hashToken(token).slice(0, 16);
    const faceId = await rek.enrollGuestFace(tk.groomUid, guestId, bytes);
    if (!faceId) {
      res.status(422).json({ error: "no_face" });
      return;
    }

    const now = Date.now();
    await ref.set({
      faceId,
      phoneE164: normalisePhone(phone ?? "") ?? tk.guestPhone ?? null,
      guestId: tk.guestId ?? null,
      guestName: tk.guestName ?? null,
      consentAt: now,
      createdAt: now,
      expireAt: Timestamp.fromMillis(tk.expiresAt),
      provider: "rekognition",
    });

    const matches = await matchesForGuestFace(tk.groomUid, faceId);
    res.json({ ok: true, expiresAt: tk.expiresAt, matches });
  } catch (err) {
    res.status(500).json({ error: "enroll_failed", detail: errorMessage(err) });
  }
});

// ─── GET /digital/photos/matches?token=… ─────────────────────────────────────

/**
 * Enrollment state + current matches. Status-shaped 200 so the page poller
 * needs no error branching; hard errors only for the token (400/404/410).
 */
photoFacesRouter.get("/matches", matchesLimiter, async (req: Request, res: Response) => {
  const token = (req.query?.token ?? "").toString();
  const tk = await loadValidToken(token, res);
  if (!tk) return;

  const base = { expiresAt: tk.expiresAt, guestPhone: tk.guestPhone ?? null, matches: [] as PhotoMatch[] };
  try {
    if (!isRekognitionConfigured() || !(await isPhotographerPublished(tk.groomUid))) {
      res.json({ published: false, enrolled: false, ...base });
      return;
    }
    const enrollSnap = await guestFaceDoc(tk.groomUid, token).get();
    const faceId = enrollSnap.exists ? (enrollSnap.data()?.faceId as string | undefined) : undefined;
    if (!faceId) {
      res.json({ published: true, enrolled: false, ...base });
      return;
    }
    const matches = await matchesForGuestFace(tk.groomUid, faceId);
    res.json({ published: true, enrolled: true, ...base, matches });
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
  }
});

// ─── DELETE /digital/photos/enroll ───────────────────────────────────────────

/** Erase the guest's stored face (AWS + Firestore). Idempotent. Body `{token}`. */
photoFacesRouter.delete("/enroll", enrollLimiter, async (req: Request, res: Response) => {
  const token = (req.query?.token ?? req.body?.token ?? "").toString();
  const tk = await loadValidToken(token, res);
  if (!tk) return;
  try {
    const ref = guestFaceDoc(tk.groomUid, token);
    const snap = await ref.get();
    const faceId = snap.exists ? (snap.data()?.faceId as string | undefined) : undefined;
    if (faceId && isRekognitionConfigured()) {
      const rek = await import("../../faceIndex/rekognition.js");
      await rek.deleteFaces(tk.groomUid, [faceId]).catch(() => undefined);
    }
    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "delete_failed", detail: errorMessage(err) });
  }
});

// ─── GET /digital/photos/zip?token=… ─────────────────────────────────────────

/** Stream the guest's matched photos as a .zip (store mode — no recompress). */
photoFacesRouter.get("/zip", matchesLimiter, async (req: Request, res: Response) => {
  const token = (req.query?.token ?? "").toString();
  const tk = await loadValidToken(token, res);
  if (!tk) return;
  if (!isRekognitionConfigured()) {
    res.status(503).json({ error: "face_engine_unavailable" });
    return;
  }
  try {
    if (!(await isPhotographerPublished(tk.groomUid))) {
      res.status(409).json({ error: "not_published" });
      return;
    }
    const enrollSnap = await guestFaceDoc(tk.groomUid, token).get();
    const faceId = enrollSnap.exists ? (enrollSnap.data()?.faceId as string | undefined) : undefined;
    if (!faceId) {
      res.status(409).json({ error: "not_enrolled" });
      return;
    }

    const rek = await import("../../faceIndex/rekognition.js");
    const hits = await rek.searchByFaceId(tk.groomUid, faceId);
    const fileRows = await loadFileRows(tk.groomUid);
    const matched = joinRekognitionMatches(hits, fileRows);
    if (!matched.length) {
      res.status(404).json({ error: "no_photos" });
      return;
    }
    const pathById = new Map(fileRows.map((f) => [f.fileId, f.storagePath]));

    const archiver = (await import("archiver")).default;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="my-photos.zip"');
    const archive = archiver("zip", { store: true });
    archive.on("error", () => {
      try {
        if (!res.headersSent) res.status(500);
        res.end();
      } catch {
        /* already torn down */
      }
    });
    archive.pipe(res);
    const bucket = getStorage().bucket();
    let n = 0;
    for (const m of matched) {
      const sp = pathById.get(m.fileId);
      if (!sp) continue;
      const safe = `${String(n++).padStart(3, "0")}_${(m.name || "photo").replace(/[^\w.\-]+/g, "_")}`;
      archive.append(bucket.file(sp).createReadStream(), { name: safe });
    }
    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "zip_failed", detail: errorMessage(err) });
    else res.end();
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface DigitalTokenRecord {
  groomUid: string;
  guestId?: string;
  guestName?: string;
  guestPhone?: string;
  guestType?: string;
  expiresAt: number;
}

async function loadValidToken(token: string, res: Response): Promise<DigitalTokenRecord | null> {
  if (!TOKEN_HEX_RE.test(token)) {
    res.status(400).json({ error: "invalid_token_format" });
    return null;
  }
  try {
    const snap = await getDatabase().ref(`inviteTokens/${token}`).get();
    if (!snap.exists()) {
      res.status(404).json({ error: "token_not_found" });
      return null;
    }
    const tk = snap.val() as DigitalTokenRecord;
    if (tk.guestType !== "digital" || !tk.groomUid) {
      res.status(409).json({ error: "wrong_invite_type" });
      return null;
    }
    if (Date.now() > tk.expiresAt) {
      res.status(410).json({ error: "token_expired" });
      return null;
    }
    return tk;
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    return null;
  }
}

function isPhotographerPublished(groomUid: string): Promise<boolean> {
  return getFirestore()
    .doc(`digitalInvitations/${groomUid}`)
    .get()
    .then((snap) => snap.exists && snap.data()?.photographerPublished === true);
}

function guestFaceDoc(groomUid: string, token: string) {
  return getFirestore().doc(`digitalInvitations/${groomUid}/guestFaces/${hashToken(token)}`);
}

/** Read the photographerFiles metadata as join rows (incl. storagePath). */
async function loadFileRows(groomUid: string): Promise<PhotoFileRow[]> {
  const snap = await getFirestore()
    .collection(`digitalInvitations/${groomUid}/photographerFiles`)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      fileId: d.id,
      name: String(data.name ?? ""),
      url: String(data.url ?? ""),
      type: String(data.type ?? ""),
      storagePath: String(data.storagePath ?? ""),
    };
  });
}

/** Search the wedding's collection by a guest FaceId and join to photo metadata. */
async function matchesForGuestFace(groomUid: string, guestFaceId: string): Promise<PhotoMatch[]> {
  const rek = await import("../../faceIndex/rekognition.js");
  const [hits, fileRows] = await Promise.all([
    rek.searchByFaceId(groomUid, guestFaceId),
    loadFileRows(groomUid),
  ]);
  return joinRekognitionMatches(hits, fileRows);
}

function errorMessage(err: unknown): string | undefined {
  if (process.env.DAWA_DEBUG_ERRORS !== "1") return undefined;
  return err instanceof Error ? err.message : String(err);
}
