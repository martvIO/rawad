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
import { getStorage, getDownloadURL } from "firebase-admin/storage";
import { getDatabase } from "firebase-admin/database";
import busboy from "busboy";
import {
  AuthRequest,
  requireAuth,
  requireAnyRole,
} from "../middleware/auth";
import { uidRateLimit } from "../middleware/rateLimit";
import { MAX_BYTES, MAX_LEN } from "../../constants/limits";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Match storage.rules `/proofs/{groomUid}/{guestId}` size cap (6 MB). */
const MAX_PROOF_BYTES = MAX_BYTES.PROOF;

/** Mirrors storage.rules contentType matcher `image/.*`. */
const ALLOWED_CONTENT_TYPE_PREFIX = "image/";

/** Acceptable proof-path shape: proofs/{groomUid}/{guestId}/{filename}.{ext} */
const PROOF_PATH_RE = /^proofs\/[^/]+\/[^/]+\/[^/]+$/;

/** Max length of an arbitrary storage path the URL endpoint will accept. */
const MAX_PATH_LEN = MAX_LEN.PATH;

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
  uidRateLimit("proofUpload", RATE.PROOF_UPLOAD_PER_USER.limit, HOUR_MS),
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
    // Constrain the id (it becomes a Storage path segment) and confirm the guest
    // actually exists under this groom. Without this an assigned driver could
    // write proof objects under arbitrary guestId folders in the groom's
    // namespace (storage litter / orphaned objects with no matching guest).
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(guestId)) {
      res.status(400).json({ error: "invalid_guest_id" });
      return;
    }
    try {
      const guestSnap = await getDatabase()
        .ref(`guestsByGroom/${groomUid}/${guestId}`)
        .get();
      if (!guestSnap.exists()) {
        res.status(404).json({ error: "guest_not_found" });
        return;
      }
    } catch (err) {
      res.status(500).json({ error: "lookup_failed", detail: errorMessage(err) });
      return;
    }

    try {
      const path = buildProofPath(groomUid, guestId, parsed.file.contentType);
      const bucket = getStorage().bucket();
      // BUG-002 fix — keep parity with uploadAndGetUrl() in digital.ts:
      // resumable uploads let GCS retry individual chunks on flaky mobile
      // networks (drivers upload from the field), which is a big reliability
      // win for proof photos shot on cellular connections.
      await bucket.file(path).save(parsed.file.buffer, {
        contentType: parsed.file.contentType,
        resumable: true,
      });
      res.json({ path });
    } catch (err) {
      res.status(500).json({ error: "upload_failed", detail: errorMessage(err) });
    }
  }
);

// ─── GET /proofs/url ──────────────────────────────────────────────────────────

/**
 * Mint a download URL for a proof photo. The client uses this to render
 * thumbnails / lightboxes without granting direct Storage SDK access.
 *
 * Uses Firebase's `getDownloadURL`, which embeds a Firebase download
 * token in the URL. Unlike `bucket.file().getSignedUrl()`, this does NOT
 * require the function's service account to hold the `Service Account
 * Token Creator` IAM role — the default Firebase deploy has no such
 * grant, and `getSignedUrl` was failing 500 in production for that
 * reason.
 *
 * Authorization (mirror of `storage.rules` /proofs read clause):
 *   - admin: any path
 *   - groom: only paths under their own `proofs/{uid}/...`
 *   - driver: only paths under a groom they're assigned to
 */
proofsRouter.get(
  "/url",
  requireAuth,
  uidRateLimit("proofUrl", RATE.PROOF_URL_PER_USER.limit, HOUR_MS),
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
      const url = await getDownloadURL(getStorage().bucket().file(path));
      res.json({ url });
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
 * Firebase Functions v2 onRequest pre-consumes the request stream and
 * exposes the raw bytes as `req.rawBody`. Piping `req` directly would feed
 * busboy zero bytes and produce an "Unexpected end of form" error. When
 * rawBody is present we hand the buffer to busboy via `bb.end(rawBody)`;
 * otherwise (tests, local dev with a non-buffered transport) we fall back
 * to piping the request stream.
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

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (rawBody) {
      bb.end(rawBody);
    } else {
      req.pipe(bb);
    }
  });
}

// errorMessage (suppress-by-default 5xx detail) is now shared — see ../errorDetail.
import { errorMessage } from "../errorDetail";
