// Pure face-matching helpers — no Firebase imports, fully unit-testable.
//
// Shared by:
//   - the photo-indexing trigger (descriptor rounding before persistence)
//   - the public /digital/photos endpoints (validation + match computation)
//
// Descriptors are 128-dimensional float vectors produced by face-api's
// FaceRecognitionNet (dlib ResNet port). The SAME model weights run in the
// guest's browser (public/models) and in the indexing trigger
// (functions/models), so euclidean distances between the two sides are
// directly comparable. `MODEL_VERSION` is stamped on every stored row; the
// matcher only compares rows whose version matches, so a future model swap
// can never silently mix incompatible descriptor spaces.

import { createHash } from "crypto";

/** Version tag for the descriptor space (face-api FaceRecognitionNet v1). */
export const MODEL_VERSION = "faceapi-frn-v1";

/** Same threshold the legacy in-browser matcher used (face-api default). */
export const MATCH_THRESHOLD = 0.5;

/** FaceRecognitionNet output dimensionality. */
export const DESCRIPTOR_LENGTH = 128;

/**
 * Components of a real face-api descriptor are small (empirically within
 * ±0.5); |x| < 4 rejects garbage while leaving generous headroom.
 */
const MAX_COMPONENT_ABS = 4;

/** One face found in an indexed photo. `d` = rounded 128-D descriptor. */
export type IndexedFace = { d: number[] };

/** Firestore row shape of digitalInvitations/{uid}/photoFaces/{fileId}. */
export type PhotoFacesRow = {
  fileId: string;
  faces: IndexedFace[];
  modelVersion: string;
  status: string;
};

/** Joined subset of digitalInvitations/{uid}/photographerFiles/{fileId}. */
export type PhotoFileRow = {
  fileId: string;
  name: string;
  url: string;
  type: string;
  /** Storage object path — needed to stream the file into a ZIP download. */
  storagePath?: string;
};

/** One matched photo returned to the guest, sorted by distance ascending. */
export type FaceMatch = {
  fileId: string;
  name: string;
  url: string;
  distance: number;
};

/**
 * Strict shape check for a client-submitted descriptor: a plain array of
 * exactly 128 finite numbers within sane bounds. Anything else is rejected
 * before it can be persisted or compared.
 */
export function validateDescriptor(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== DESCRIPTOR_LENGTH) return false;
  for (const v of value) {
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
    if (Math.abs(v) >= MAX_COMPONENT_ABS) return false;
  }
  return true;
}

/**
 * Round descriptor components to 4 decimals before persisting. Halves the
 * serialized size; the induced distance error (≤ ~0.0006 over 128 dims) is
 * negligible against the 0.5 match threshold.
 */
export function roundDescriptor(descriptor: ArrayLike<number>): number[] {
  const out = new Array<number>(descriptor.length);
  for (let i = 0; i < descriptor.length; i++) {
    out[i] = Math.round(descriptor[i] * 1e4) / 1e4;
  }
  return out;
}

/** Plain euclidean distance — same metric face-api uses for matching. */
export function euclideanDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Match a guest descriptor against the photo-face index.
 *
 * Per photo: the BEST (minimum) distance over all faces in it decides the
 * match. Only rows with `status === "ok"` and the current MODEL_VERSION
 * participate; results join display fields from `fileRows` (photos whose
 * metadata doc vanished are dropped) and come back sorted closest-first.
 */
export function computeMatches(
  guestDescriptor: number[],
  faceRows: PhotoFacesRow[],
  fileRows: PhotoFileRow[],
  threshold: number = MATCH_THRESHOLD,
): FaceMatch[] {
  const filesById = new Map(fileRows.map((f) => [f.fileId, f]));
  const matches: FaceMatch[] = [];
  for (const row of faceRows) {
    if (row.status !== "ok" || row.modelVersion !== MODEL_VERSION) continue;
    const file = filesById.get(row.fileId);
    if (!file) continue;
    let best = Infinity;
    for (const face of row.faces) {
      if (!face?.d || face.d.length !== guestDescriptor.length) continue;
      const dist = euclideanDistance(guestDescriptor, face.d);
      if (dist < best) best = dist;
    }
    if (best <= threshold) {
      matches.push({
        fileId: file.fileId,
        name: file.name,
        url: file.url,
        distance: Math.round(best * 1e4) / 1e4,
      });
    }
  }
  matches.sort((a, b) => a.distance - b.distance);
  return matches;
}

/**
 * Firestore doc id for a guest's enrollment: SHA-256 of the invite token.
 * The raw token is a bearer credential (it can RSVP on the guest's behalf),
 * and doc ids leak into logs/exports — so never use it as an id directly.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ─── AWS Rekognition helpers (pure; the SDK calls live in rekognition.ts) ─────
//
// Rekognition stores faces in a per-wedding Collection. We tag every indexed
// face with an ExternalImageId so a search result maps straight back to its
// source without a second lookup:
//   - photographer-photo faces → "photo:{fileId}"
//   - an enrolled guest selfie → "guest:{guestId}"
// ExternalImageId allows [a-zA-Z0-9_.\-:]+, so the colon separator is legal.

export const PHOTO_KIND = "photo";
export const GUEST_KIND = "guest";

/** Normalized face box as fractions [0..1] of the image (Rekognition-native). */
export type FaceBox = { x: number; y: number; w: number; h: number };

/** One face indexed into a Rekognition collection (stored in photoFaces). */
export type RekIndexedFace = { faceId: string; box: FaceBox; confidence: number };

/** A Rekognition SearchFaces / SearchFacesByImage hit (provider-agnostic shape). */
export type RekSearchMatch = { faceId: string; externalImageId?: string; similarity: number };

/** One matched photo returned to the guest, sorted by similarity descending. */
export type PhotoMatch = { fileId: string; name: string; url: string; similarity: number };

export function toExternalId(kind: string, id: string): string {
  return `${kind}:${id}`;
}

/** Split an ExternalImageId back into { kind, id }; null if malformed. */
export function parseExternalId(
  extId: string | undefined | null,
): { kind: string; id: string } | null {
  if (typeof extId !== "string") return null;
  const idx = extId.indexOf(":");
  if (idx <= 0 || idx === extId.length - 1) return null;
  return { kind: extId.slice(0, idx), id: extId.slice(idx + 1) };
}

/**
 * Join Rekognition search hits to photographer-file metadata for display.
 * Keeps only `photo:` faces, drops files whose metadata doc vanished, dedupes
 * to one row per photo (best similarity wins), and sorts closest-match first.
 */
export function joinRekognitionMatches(
  searchMatches: RekSearchMatch[],
  fileRows: PhotoFileRow[],
): PhotoMatch[] {
  const filesById = new Map(fileRows.map((f) => [f.fileId, f]));
  const bestByFile = new Map<string, PhotoMatch>();
  for (const m of searchMatches) {
    const parsed = parseExternalId(m.externalImageId);
    if (!parsed || parsed.kind !== PHOTO_KIND) continue;
    const file = filesById.get(parsed.id);
    if (!file) continue;
    const prev = bestByFile.get(file.fileId);
    const similarity = Math.round((m.similarity ?? 0) * 100) / 100;
    if (!prev || similarity > prev.similarity) {
      bestByFile.set(file.fileId, {
        fileId: file.fileId,
        name: file.name,
        url: file.url,
        similarity,
      });
    }
  }
  return Array.from(bestByFile.values()).sort((a, b) => b.similarity - a.similarity);
}
