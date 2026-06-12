// Unit tests for the pure face-matching helpers behind the photo face-index
// feature (functions/src/faceIndex/match.ts). Pure logic — no emulator.
import { describe, it, expect } from "vitest";
import {
  MODEL_VERSION,
  MATCH_THRESHOLD,
  DESCRIPTOR_LENGTH,
  validateDescriptor,
  roundDescriptor,
  euclideanDistance,
  computeMatches,
  hashToken,
  PhotoFacesRow,
  PhotoFileRow,
} from "../../functions/src/faceIndex/match";

/** A valid descriptor: 128 small finite numbers. */
function makeDescriptor(fill = 0.1): number[] {
  return new Array(DESCRIPTOR_LENGTH).fill(fill);
}

describe("validateDescriptor", () => {
  it("accepts a 128-length array of small finite numbers", () => {
    expect(validateDescriptor(makeDescriptor())).toBe(true);
    expect(validateDescriptor(makeDescriptor(-0.4999))).toBe(true);
  });

  it("rejects non-arrays", () => {
    expect(validateDescriptor(null)).toBe(false);
    expect(validateDescriptor(undefined)).toBe(false);
    expect(validateDescriptor("abc")).toBe(false);
    expect(validateDescriptor({ length: 128 })).toBe(false);
    expect(validateDescriptor(new Float32Array(128))).toBe(false);
  });

  it("rejects wrong lengths", () => {
    expect(validateDescriptor(makeDescriptor().slice(0, 127))).toBe(false);
    expect(validateDescriptor([...makeDescriptor(), 0.1])).toBe(false);
    expect(validateDescriptor([])).toBe(false);
  });

  it("rejects non-finite and out-of-range components", () => {
    for (const bad of [NaN, Infinity, -Infinity, 4, -4, 5000]) {
      const d = makeDescriptor();
      d[64] = bad;
      expect(validateDescriptor(d)).toBe(false);
    }
  });

  it("rejects non-number components", () => {
    const d: unknown[] = makeDescriptor();
    d[0] = "0.1";
    expect(validateDescriptor(d)).toBe(false);
  });
});

describe("roundDescriptor", () => {
  it("rounds to 4 decimal places", () => {
    expect(roundDescriptor([0.123456789, -0.00006])).toEqual([0.1235, -0.0001]);
  });

  it("keeps the distance error negligible vs the threshold", () => {
    const a = new Array(DESCRIPTOR_LENGTH).fill(0).map((_, i) => Math.sin(i) * 0.3);
    const rounded = roundDescriptor(a);
    expect(euclideanDistance(a, rounded)).toBeLessThan(0.001);
  });

  it("accepts Float32Array input (face-api returns one)", () => {
    const out = roundDescriptor(new Float32Array([0.25, 0.5]));
    expect(out).toEqual([0.25, 0.5]);
    expect(Array.isArray(out)).toBe(true);
  });
});

describe("euclideanDistance", () => {
  it("computes known distances", () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
    expect(euclideanDistance([1, 1, 1], [1, 1, 1])).toBe(0);
  });
});

describe("computeMatches", () => {
  const guest = makeDescriptor(0.1);

  const fileRow = (fileId: string): PhotoFileRow => ({
    fileId,
    name: `${fileId}.jpg`,
    url: `https://x/${fileId}`,
    type: "image/jpeg",
  });

  const faceRow = (
    fileId: string,
    faces: number[][],
    overrides: Partial<PhotoFacesRow> = {},
  ): PhotoFacesRow => ({
    fileId,
    faces: faces.map((d) => ({ d })),
    modelVersion: MODEL_VERSION,
    status: "ok",
    ...overrides,
  });

  it("matches photos within the threshold, sorted closest-first", () => {
    const near = makeDescriptor(0.1);
    near[0] += 0.2; // distance 0.2
    const nearer = makeDescriptor(0.1);
    nearer[0] += 0.05; // distance 0.05
    const far = makeDescriptor(0.6); // distance ≈ 5.66

    const matches = computeMatches(
      guest,
      [faceRow("a", [near]), faceRow("b", [far]), faceRow("c", [nearer])],
      [fileRow("a"), fileRow("b"), fileRow("c")],
    );
    expect(matches.map((m) => m.fileId)).toEqual(["c", "a"]);
    expect(matches[0].distance).toBeCloseTo(0.05, 3);
    expect(matches[0].url).toBe("https://x/c");
  });

  it("uses the BEST face per photo", () => {
    const near = makeDescriptor(0.1);
    near[0] += 0.1;
    const far = makeDescriptor(0.9);
    const matches = computeMatches(guest, [faceRow("a", [far, near])], [fileRow("a")]);
    expect(matches).toHaveLength(1);
    expect(matches[0].distance).toBeCloseTo(0.1, 3);
  });

  it("skips rows with a different model version or non-ok status", () => {
    const exact = makeDescriptor(0.1);
    const rows = [
      faceRow("stale", [exact], { modelVersion: "other-model" }),
      faceRow("broken", [exact], { status: "failed" }),
      faceRow("good", [exact]),
    ];
    const matches = computeMatches(guest, rows, [fileRow("stale"), fileRow("broken"), fileRow("good")]);
    expect(matches.map((m) => m.fileId)).toEqual(["good"]);
  });

  it("drops index rows whose photo metadata doc is gone", () => {
    const matches = computeMatches(guest, [faceRow("orphan", [makeDescriptor(0.1)])], []);
    expect(matches).toEqual([]);
  });

  it("ignores malformed faces and photos with no faces", () => {
    const rows: PhotoFacesRow[] = [
      { fileId: "a", faces: [], modelVersion: MODEL_VERSION, status: "ok" },
      { fileId: "b", faces: [{ d: [0.1, 0.2] }], modelVersion: MODEL_VERSION, status: "ok" },
    ];
    expect(computeMatches(guest, rows, [fileRow("a"), fileRow("b")])).toEqual([]);
  });

  it("treats the threshold as inclusive", () => {
    // 0 and 0.5 are exact in binary floating point, so the distance is
    // EXACTLY the threshold — no rounding slack.
    const zeroGuest = makeDescriptor(0);
    const onEdge = makeDescriptor(0);
    onEdge[0] = MATCH_THRESHOLD;
    const matches = computeMatches(zeroGuest, [faceRow("edge", [onEdge])], [fileRow("edge")]);
    expect(matches).toHaveLength(1);
  });
});

describe("hashToken", () => {
  it("derives a stable sha256 hex id", () => {
    const token = "ab".repeat(16);
    const h = hashToken(token);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).toBe(h);
    expect(hashToken("cd".repeat(16))).not.toBe(h);
  });
});
