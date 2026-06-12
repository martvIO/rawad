// Server-side face detection engine for the photo-indexing trigger.
//
// Runtime: @vladmandic/face-api on the tfjs WASM backend. Chosen over
// tfjs-node deliberately — no native binaries to build on Cloud Build, and
// identical behavior between the Windows dev machine, the emulator, and the
// deployed Linux runtime. The Emscripten glue locates its .wasm binary next
// to its own dist file via fs (no network, no setWasmPaths needed).
//
// Descriptor compatibility: loads the face_recognition_model weights from
// functions/models, which are byte-identical copies of public/models — the
// files the guest's browser loads. Same weights ⇒ same descriptor space ⇒
// client/server euclidean distances are directly comparable. The DETECTOR
// differs (SSD MobileNet v1 here vs TinyFaceDetector in-browser) for better
// recall on group shots; detector choice doesn't affect the descriptor space.
//
// HEAVY MODULE — ~12 MB of weights + tfjs init. Must only ever be loaded via
// dynamic import() from the trigger handler, NEVER statically from anything
// the `api` function pulls in.

import * as path from "path";
import * as faceapi from "@vladmandic/face-api/dist/face-api.node-wasm.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { roundDescriptor, IndexedFace } from "./match";

/** Longest image side fed to the detector. Caps decode + tensor memory. */
const MAX_SIDE_PX = 2048;

/**
 * Refuse to decode pathological files. 200 MB uploads are allowed for
 * photographer VIDEOS; a still image this large would decode to an RGBA
 * buffer several times bigger and risk the 2 GiB function limit.
 */
const MAX_DECODE_BYTES = 80 * 1024 * 1024;

/** SSD MobileNet minimum confidence — favors recall on crowded shots. */
const MIN_CONFIDENCE = 0.4;

/** Hard cap on faces per photo; also bounds the Firestore row size. */
const MAX_FACES_PER_PHOTO = 100;

// lib/faceIndex/engine.js → ../../models = functions/models (shipped with deploy).
const MODELS_DIR = path.resolve(__dirname, "..", "..", "models");

export type DetectOutcome =
  | { status: "ok"; faces: IndexedFace[] }
  | { status: "failed_decode" | "skipped_too_large" | "failed"; faces: never[]; error: string };

/** One-time tf backend + model init, cached across invocations. */
let initPromise: Promise<void> | null = null;

// The published .d.ts types `tf` narrowly; the runtime object is the full
// tfjs namespace. Surface just the two init methods we need.
const tfRuntime = faceapi.tf as unknown as {
  setBackend(name: string): Promise<boolean>;
  ready(): Promise<void>;
};

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await tfRuntime.setBackend("wasm");
      await tfRuntime.ready();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_DIR),
        faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR),
        faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR),
      ]);
    })();
    // A failed init must not poison every later invocation of a warm instance.
    initPromise.catch(() => { initPromise = null; });
  }
  return initPromise;
}

/**
 * Detect all faces in an encoded image buffer and return their rounded
 * 128-D descriptors. Never throws — every failure mode collapses into a
 * status the trigger persists as-is.
 */
export async function detectFacesInImage(buffer: Buffer): Promise<DetectOutcome> {
  if (buffer.length > MAX_DECODE_BYTES) {
    return { status: "skipped_too_large", faces: [], error: `image is ${buffer.length} bytes` };
  }

  try {
    await ensureInit();
  } catch (err) {
    return { status: "failed", faces: [], error: `engine init failed: ${errMsg(err)}` };
  }

  // Decode + downscale via @napi-rs/canvas (HEIC and friends land here too —
  // decode failure is terminal for the file, not for the trigger).
  let imageData: { data: Uint8ClampedArray; width: number; height: number };
  try {
    const img = await loadImage(buffer);
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    imageData = ctx.getImageData(0, 0, w, h);
  } catch (err) {
    return { status: "failed_decode", faces: [], error: errMsg(err) };
  }

  try {
    const { data, width, height } = imageData;
    // RGBA → RGB int32 tensor (face-api accepts a Tensor3D as net input).
    const rgb = new Int32Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i + 1];
      rgb[j + 2] = data[i + 2];
    }
    const tensor = faceapi.tf.tensor3d(rgb, [height, width, 3], "int32");
    try {
      const results = await faceapi
        .detectAllFaces(
          tensor as never,
          new faceapi.SsdMobilenetv1Options({
            minConfidence: MIN_CONFIDENCE,
            maxResults: MAX_FACES_PER_PHOTO,
          }),
        )
        .withFaceLandmarks()
        .withFaceDescriptors();
      const faces: IndexedFace[] = results.map((r) => ({
        d: roundDescriptor(r.descriptor),
      }));
      return { status: "ok", faces };
    } finally {
      tensor.dispose();
    }
  } catch (err) {
    return { status: "failed", faces: [], error: errMsg(err) };
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
