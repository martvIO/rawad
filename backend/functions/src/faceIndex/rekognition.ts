// AWS Rekognition engine — one Collection per wedding.
//
// This is the single seam between our app and AWS. Everything Rekognition-
// specific (collections, IndexFaces, SearchFaces, Face Liveness, deletion)
// lives here; the rest of the codebase deals in plain {faceId, box, similarity}
// shapes from match.ts. Callers must gate on isRekognitionConfigured() first —
// these functions assume AWS env credentials are present.
//
// Data model:
//   CollectionId        = `${PREFIX}_${groomUid}`           (one per wedding)
//   photographer faces  → ExternalImageId "photo:{fileId}"
//   enrolled guest face → ExternalImageId "guest:{guestId}"
// Bounding boxes come back natively normalized 0..1 — free person-tile crops.

import {
  RekognitionClient,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  SearchFacesCommand,
  DeleteFacesCommand,
  ListFacesCommand,
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
  type BoundingBox,
} from "@aws-sdk/client-rekognition";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { isRekognitionConfigured } from "./config";
import {
  FaceBox,
  RekIndexedFace,
  RekSearchMatch,
  toExternalId,
  PHOTO_KIND,
  GUEST_KIND,
} from "./match";

/** Rekognition Image.Bytes hard limit. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Cap the longest side when we must recompress (keeps faces detectable). */
const MAX_SIDE_PX = 3840;
/** Default match thresholds (Rekognition similarity is 0..100). */
export const PERSONAL_MATCH_THRESHOLD = 90;

let _client: RekognitionClient | null = null;

function client(): RekognitionClient {
  if (!isRekognitionConfigured()) {
    throw new Error("rekognition_not_configured");
  }
  if (!_client) {
    // Credentials + region come from the standard AWS env var chain
    // (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION).
    _client = new RekognitionClient({ region: process.env.AWS_REGION });
  }
  return _client;
}

/** CollectionId for a wedding. Firebase uids are within the allowed charset. */
export function collectionId(uid: string): string {
  const prefix = process.env.REKOGNITION_COLLECTION_PREFIX || "dawa";
  return `${prefix}_${uid}`;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function toBox(bb?: BoundingBox): FaceBox {
  return {
    x: round4(bb?.Left ?? 0),
    y: round4(bb?.Top ?? 0),
    w: round4(bb?.Width ?? 0),
    h: round4(bb?.Height ?? 0),
  };
}

/**
 * Shrink an image to satisfy Rekognition's 5 MB Image.Bytes limit. Small
 * images pass through untouched; larger ones are decoded once and recompressed
 * at a decreasing scale until they fit.
 */
export async function prepareImageBytes(buffer: Buffer): Promise<Buffer> {
  if (buffer.length <= MAX_IMAGE_BYTES) return buffer;
  const img = await loadImage(buffer);
  let scale = Math.min(1, MAX_SIDE_PX / Math.max(img.width, img.height));
  for (let attempt = 0; attempt < 5; attempt++) {
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(w, h);
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const out = (await canvas.encode("jpeg", 82)) as Buffer;
    if (out.length <= MAX_IMAGE_BYTES) return out;
    scale *= 0.8;
  }
  const w = Math.max(1, Math.round(img.width * 0.35));
  const h = Math.max(1, Math.round(img.height * 0.35));
  const canvas = createCanvas(w, h);
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return (await canvas.encode("jpeg", 70)) as Buffer;
}

/** Create the wedding's collection (idempotent). Returns the CollectionId. */
export async function ensureCollection(uid: string): Promise<string> {
  const id = collectionId(uid);
  try {
    await client().send(new CreateCollectionCommand({ CollectionId: id }));
  } catch (err) {
    if ((err as { name?: string })?.name !== "ResourceAlreadyExistsException") throw err;
  }
  return id;
}

/** Delete a wedding's entire collection (used by purge / erase-now). */
export async function deleteCollection(uid: string): Promise<void> {
  try {
    await client().send(new DeleteCollectionCommand({ CollectionId: collectionId(uid) }));
  } catch (err) {
    if ((err as { name?: string })?.name !== "ResourceNotFoundException") throw err;
  }
}

/** Index every face in a photographer photo. Returns the stored face shapes. */
export async function indexPhotoFaces(
  uid: string,
  fileId: string,
  buffer: Buffer,
  maxFaces = 50,
): Promise<RekIndexedFace[]> {
  const id = await ensureCollection(uid);
  const bytes = await prepareImageBytes(buffer);
  const out = await client().send(
    new IndexFacesCommand({
      CollectionId: id,
      Image: { Bytes: bytes },
      ExternalImageId: toExternalId(PHOTO_KIND, fileId),
      QualityFilter: "AUTO",
      MaxFaces: maxFaces,
      DetectionAttributes: [],
    }),
  );
  return (out.FaceRecords ?? [])
    .filter((r) => r.Face?.FaceId)
    .map((r) => ({
      faceId: r.Face!.FaceId as string,
      box: toBox(r.Face!.BoundingBox),
      confidence: round4(r.Face!.Confidence ?? 0),
    }));
}

/** Index a guest's selfie (largest face). Returns its FaceId, or null. */
export async function enrollGuestFace(
  uid: string,
  guestId: string,
  buffer: Buffer,
): Promise<string | null> {
  const id = await ensureCollection(uid);
  const bytes = await prepareImageBytes(buffer);
  const out = await client().send(
    new IndexFacesCommand({
      CollectionId: id,
      Image: { Bytes: bytes },
      ExternalImageId: toExternalId(GUEST_KIND, guestId),
      QualityFilter: "AUTO",
      MaxFaces: 1,
      DetectionAttributes: [],
    }),
  );
  return out.FaceRecords?.[0]?.Face?.FaceId ?? null;
}

/** Search the collection by an uploaded selfie image. */
export async function searchByImage(
  uid: string,
  buffer: Buffer,
  threshold = PERSONAL_MATCH_THRESHOLD,
): Promise<RekSearchMatch[]> {
  const bytes = await prepareImageBytes(buffer);
  const out = await client().send(
    new SearchFacesByImageCommand({
      CollectionId: collectionId(uid),
      Image: { Bytes: bytes },
      FaceMatchThreshold: threshold,
      MaxFaces: 100,
    }),
  );
  return mapMatches(out.FaceMatches);
}

/** Search the collection by an already-indexed FaceId (guest enrollment). */
export async function searchByFaceId(
  uid: string,
  faceId: string,
  threshold = PERSONAL_MATCH_THRESHOLD,
  maxFaces = 100,
): Promise<RekSearchMatch[]> {
  const out = await client().send(
    new SearchFacesCommand({
      CollectionId: collectionId(uid),
      FaceId: faceId,
      FaceMatchThreshold: threshold,
      MaxFaces: maxFaces,
    }),
  );
  return mapMatches(out.FaceMatches);
}

function mapMatches(
  matches: { Similarity?: number; Face?: { FaceId?: string; ExternalImageId?: string } }[] | undefined,
): RekSearchMatch[] {
  return (matches ?? [])
    .filter((m) => m.Face?.FaceId)
    .map((m) => ({
      faceId: m.Face!.FaceId as string,
      externalImageId: m.Face!.ExternalImageId,
      similarity: m.Similarity ?? 0,
    }));
}

/** Delete specific faces (guest opt-out, re-index cleanup). Idempotent. */
export async function deleteFaces(uid: string, faceIds: string[]): Promise<void> {
  const ids = faceIds.filter(Boolean);
  if (!ids.length) return;
  // Rekognition caps DeleteFaces at 4096 ids per call; chunk defensively.
  for (let i = 0; i < ids.length; i += 1000) {
    await client().send(
      new DeleteFacesCommand({ CollectionId: collectionId(uid), FaceIds: ids.slice(i, i + 1000) }),
    );
  }
}

/** List every faceId in a collection (paginated) — used by purge/diagnostics. */
export async function listAllFaceIds(uid: string): Promise<string[]> {
  const ids: string[] = [];
  let token: string | undefined;
  do {
    const out = await client().send(
      new ListFacesCommand({ CollectionId: collectionId(uid), MaxResults: 1000, NextToken: token }),
    );
    for (const f of out.Faces ?? []) if (f.FaceId) ids.push(f.FaceId);
    token = out.NextToken;
  } while (token);
  return ids;
}

// ─── Face Liveness (camera path anti-spoofing) ────────────────────────────────

/** Start a Face Liveness session; the browser component runs it. */
export async function createLivenessSession(): Promise<string | null> {
  const out = await client().send(new CreateFaceLivenessSessionCommand({}));
  return out.SessionId ?? null;
}

export type LivenessResult = {
  status: string;
  confidence: number;
  referenceImage: Buffer | null;
};

/** Fetch a finished Liveness session: status, confidence + reference selfie. */
export async function getLivenessResults(sessionId: string): Promise<LivenessResult> {
  const out = await client().send(
    new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId }),
  );
  const ref = out.ReferenceImage?.Bytes;
  return {
    status: String(out.Status ?? ""),
    confidence: out.Confidence ?? 0,
    referenceImage: ref ? Buffer.from(ref as Uint8Array) : null,
  };
}
