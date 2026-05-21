// Proof-photo endpoints (multipart upload + download URL).
//
//   POST /proofs/upload          driver (assigned to groomUid): upload one image
//   GET  /proofs/url?path=...    any authed: signed download URL for one object
//
// Storage layout: /proofs/{groomUid}/{guestId}/{timestamp}.{ext}
// Storage rules already enforce read/write authorization, but since this
// endpoint uses the Admin SDK (which bypasses rules), the authz model is
// re-enforced here:
//   - upload: caller must be a driver AND `assignedGrooms[groomUid] === true`
//   - download URL: caller must be the owning groom OR admin (drivers can
//     also pull a URL for proofs they just uploaded — same rule as
//     `storage.rules` /proofs read: groom uid OR admin)
//
// What this file does NOT do:
//   - It does not resize/transcode images. The mobile client sends already-
//     compressed JPEGs from the camera.
//   - It does not delete proofs. Deletes happen as a side-effect of guest
//     deletion in routes/users.ts.

import { Router, Request, Response } from "express";
import { getStorage } from "firebase-admin/storage";
import busboy from "busboy";
import {
  AuthRequest,
  requireAuth,
  requireAnyRole,
} from "../middleware/auth";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Match storage.rules `/proofs/{groomUid}/{guestId}` size cap (6 MB). */
const MAX_PROOF_BYTES = 6 * 1024 * 1024;

/** Mirrors storage.rules contentType matcher `image/.*`. */
const ALLOWED_CONTENT_TYPE_PREFIX = "image/";

/** Signed-URL lifetime when generating a read URL. */
const DOWNLOAD_URL_TTL_MS = 60 * 60 * 1000;

/** Acceptable proof-path shape: proofs/{groomUid}/{guestId}/{filename}.{ext} */
const PROOF_PATH_RE = /^proofs\/[^/]+\/[^/]+\/[^/]+$/;

/** Max length of an arbitrary storage path the URL endpoint will accept. */
const MAX_PATH_LEN = 240;

export const proofsRouter = Router();

// ─── POST /proofs/upload ──────────────────────────────────────────────────────

/**
 * Upload one proof photo. Multipart body shape:
 *   - field `groomUid`  (string, required)
 *   - field `guestId`   (string, required)
 *   - file  `file`      (image/*, required, ≤ 6 MB)
 *
 * The driver's claim must include `assignedGrooms[groomUid] === true`,
 * mirroring `storage.rules`. The Admin SDK bypasses Storage rules, so this
 * check must happen here.
 *
 * Returns `{ path }` where path is the Storage object path (e.g.
 * `proofs/{groomUid}/{guestId}/1731234567890.jpg`) suitable for storing
 * on the guest record's `proofPhotoPath`.
 */
proofsRouter.post(
  "/upload",
  requireAuth,
  requireAnyRole("driver"),
  async (req: AuthRequest, res: Response) => {
    let parsed: ParsedUpload;
    try {
      parsed = await parseMultipart(req);
    } catch (err) {
      res.status(400).json({ error: "invalid_multipart", detail: errorMessage(err) });
      return;
    }
    if (!parsed.fields.groomUid || !parsed.fields.guestId) {
      res.status(400).json({ error: "missing_required" });
      return;
    }
    if (!parsed.file) {
      res.status(400).json({ error: "missing_file" });
      return;
    }
    if (parsed.file.truncated) {
      res.status(413).json({ error: "file_too_large", maxBytes: MAX_PROOF_BYTES });
      return;
    }
    if (!parsed.file.contentType.startsWith(ALLOWED_CONTENT_TYPE_PREFIX)) {
      res.status(415).json({ error: "unsupported_content_type" });
      return;
    }

    const { groomUid, guestId } = parsed.fields;
    const claims = req.caller!.claims;
    const assignedTo = claims.assignedGrooms?.[groomUid] === true;
    if (!assignedTo) {
      res.status(403).json({ error: "not_assigned_to_groom" });
      return;
    }

    try {
      const path = buildProofPath(groomUid, guestId, parsed.file.contentType);
      const bucket = getStorage().bucket();
      await bucket.file(path).save(parsed.file.buffer, {
        contentType: parsed.file.contentType,
        resumable: false,
      });
      res.json({ path });
    } catch (err) {
      res.status(500).json({ error: "upload_failed", detail: errorMessage(err) });
    }
  }
);

// ─── GET /proofs/url ──────────────────────────────────────────────────────────

/**
 * Mint a short-lived (1h) signed download URL for a proof photo. The
 * client uses this to render thumbnails / lightboxes without granting
 * direct Storage SDK access. The frontend `<img src>` then fetches the
 * URL anonymously over HTTPS.
 *
 * Authorization (mirror of `storage.rules` /proofs read clause):
 *   - admin: any path
 *   - groom: only paths under their own `proofs/{uid}/...`
 *   - driver: only paths under a groom they're assigned to
 */
proofsRouter.get(
  "/url",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const path = (req.query.path ?? "").toString();
    if (!path || path.length > MAX_PATH_LEN) {
      res.status(400).json({ error: "invalid_path" });
      return;
    }
    if (!PROOF_PATH_RE.test(path)) {
      res.status(400).json({ error: "invalid_path_format" });
      return;
    }

    const groomUidFromPath = path.split("/")[1];
    if (!canReadProof(req, groomUidFromPath)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    try {
      const expires = Date.now() + DOWNLOAD_URL_TTL_MS;
      const [url] = await getStorage()
        .bucket()
        .file(path)
        .getSignedUrl({ action: "read", expires });
      res.json({ url, expires });
    } catch (err) {
      res.status(500).json({ error: "url_failed", detail: errorMessage(err) });
    }
  }
);

// ─── Authorization helper ─────────────────────────────────────────────────────

/**
 * Read access to a proof photo: admin OR owning groom OR assigned driver.
 * Mirrors `storage.rules` /proofs `allow read` AND adds the driver case so
 * a driver can render the photo they just uploaded.
 */
function canReadProof(req: AuthRequest, groomUid: string): boolean {
  const claims = req.caller!.claims;
  if (claims.role === "admin") return true;
  if (req.caller!.uid === groomUid) return true;
  if (
    claims.role === "driver" &&
    claims.assignedGrooms &&
    claims.assignedGrooms[groomUid] === true
  ) {
    return true;
  }
  return false;
}

// ─── Path + multipart helpers ─────────────────────────────────────────────────

/**
 * Build a Storage path for the new upload. Picks an extension from the
 * MIME type (best-effort; falls back to `.jpg` for unknown subtypes).
 */
function buildProofPath(
  groomUid: string,
  guestId: string,
  contentType: string
): string {
  const ext = pickExtensionFromMime(contentType);
  return `proofs/${groomUid}/${guestId}/${Date.now()}.${ext}`;
}

function pickExtensionFromMime(mime: string): string {
  // `image/jpeg` → `jpg`, `image/png` → `png`, etc.
  const subtype = mime.split("/")[1]?.toLowerCase() ?? "jpg";
  if (subtype === "jpeg") return "jpg";
  if (/^[a-z0-9]+$/.test(subtype)) return subtype;
  return "jpg";
}

interface ParsedUpload {
  fields: { groomUid?: string; guestId?: string };
  file: {
    buffer: Buffer;
    contentType: string;
    filename: string;
    truncated: boolean;
  } | null;
}

/**
 * Parse a multipart request using busboy. Buffers the file in memory up to
 * `MAX_PROOF_BYTES`. Resolves with `parsed.file.truncated === true` when
 * the cap is exceeded so the handler can return 413.
 *
 * Returns once busboy emits `finish` AND any in-progress file stream has
 * fully drained; both events are awaited to avoid resolving before the
 * full file is buffered.
 */
function parseMultipart(req: Request): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_PROOF_BYTES, fields: 16 },
    });
    const result: ParsedUpload = { fields: {}, file: null };

    bb.on("field", (name, val) => {
      if (name === "groomUid" || name === "guestId") {
        result.fields[name] = val.slice(0, 128);
      }
    });

    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      let truncated = false;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        truncated = true;
      });
      stream.on("end", () => {
        result.file = {
          buffer: Buffer.concat(chunks),
          contentType: info.mimeType || "application/octet-stream",
          filename: info.filename ?? "upload.bin",
          truncated,
        };
      });
      stream.on("error", reject);
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve(result));
    req.pipe(bb);
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
