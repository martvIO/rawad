import { getStorage, getDownloadURL } from "firebase-admin/storage";
import busboy from "busboy";
import { Request } from "express";

/**
 * Save a buffer to Storage and return a Firebase download URL. The URL
 * uses a Firebase download token embedded in the link, which stays valid
 * until the token is rotated/revoked — strictly better than the prior
 * 30-day signed URL that expired even while still referenced in
 * Firestore.
 *
 * `getDownloadURL` (firebase-admin/storage ≥ v11.4) does NOT require the
 * `Service Account Token Creator` IAM role that `bucket.file().getSignedUrl()`
 * needs, so it works out of the box on a default Firebase Functions deploy.
 *
 * BUG-002 fix — `resumable: true` lets the GCS client chunk the upload
 * and retry individual chunks on transient errors instead of restarting
 * the entire file on any failure. For the larger uploads we support
 * (photographer files up to 200 MB), this is the difference between a
 * failed flaky network costing the whole upload vs. just a few seconds.
 * For small files there's a tiny extra round trip to start the session,
 * but it's well under a second and worth the reliability win.
 */
async function uploadAndGetUrl(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const file = getStorage().bucket().file(path);
  await file.save(buffer, { contentType, resumable: true });
  return getDownloadURL(file);
}

/**
 * Best-effort delete of a Storage object. Logs but never throws — the
 * Firestore record (or media[] entry) has already been pruned, and a
 * dangling Storage object is recoverable via a sweep.
 */
async function deleteStorageObjectSilently(path: string): Promise<void> {
  try {
    await getStorage().bucket().file(path).delete();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[digital] storage delete failed", path, err);
  }
}

/**
 * Best-effort delete of every object under a prefix. Used by full-media
 * removal — the Firestore doc deletion is the source of truth.
 */
async function deleteStorageFolder(prefix: string): Promise<void> {
  try {
    const [files] = await getStorage().bucket().getFiles({ prefix });
    await Promise.all(
      files.map((f) =>
        f.delete().catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[digital] folder delete failed", f.name, err);
        })
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[digital] folder list failed", prefix, err);
  }
}


function kindOf(contentType: string): "video" | "gif" | "image" {
  if (contentType.startsWith("video")) return "video";
  if (contentType === "image/gif") return "gif";
  return "image";
}

// ─── Multipart parsing ────────────────────────────────────────────────────────

interface ParsedMultipart {
  fields: Record<string, string>;
  file: {
    buffer: Buffer;
    contentType: string;
    filename: string;
    truncated: boolean;
  } | null;
}

/**
 * Parse a multipart upload buffered in memory, capped at `maxBytes`.
 * Promise resolves once busboy emits `finish` AND any file stream's `end`
 * has fired (busboy emits `finish` only after all parts are complete).
 *
 * Firebase Functions v2 onRequest consumes the request body up front and
 * exposes the raw bytes as `req.rawBody`. Piping `req` directly would
 * feed busboy zero bytes and produce an "Unexpected end of form" error
 * (surfaced to the client as `invalid_multipart`). When rawBody is
 * present we hand it to busboy via `bb.end(rawBody)`; otherwise (tests,
 * local dev) we fall back to piping the request stream.
 */
function parseMultipart(
  req: Request,
  maxBytes: number
): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: maxBytes, fields: 16 },
    });
    const result: ParsedMultipart = { fields: {}, file: null };

    bb.on("field", (name, val) => {
      result.fields[name] = val.slice(0, 1024);
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

function hasAllowedPrefix(contentType: string, prefixes: string[]): boolean {
  return prefixes.some((p) => contentType.startsWith(p));
}

function pickExtensionFromFilename(filename: string, fallback: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return fallback;
  const ext = filename.slice(dot + 1).toLowerCase();
  if (/^[a-z0-9]+$/.test(ext) && ext.length <= 8) return ext;
  return fallback;
}


export { uploadAndGetUrl, deleteStorageObjectSilently, deleteStorageFolder, kindOf, parseMultipart, hasAllowedPrefix, pickExtensionFromFilename };
export type { ParsedMultipart };
