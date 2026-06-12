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
