// Unit tests for the pure Rekognition helpers in faceIndex/match.ts:
// ExternalImageId encode/decode and the search-hit → photo join. No AWS.
import { describe, it, expect } from "vitest";
import {
  toExternalId,
  parseExternalId,
  joinRekognitionMatches,
  PHOTO_KIND,
  GUEST_KIND,
  PhotoFileRow,
  RekSearchMatch,
} from "../../functions/src/faceIndex/match";

describe("toExternalId / parseExternalId", () => {
  it("round-trips photo and guest ids", () => {
    expect(toExternalId(PHOTO_KIND, "file123")).toBe("photo:file123");
    expect(parseExternalId("photo:file123")).toEqual({ kind: "photo", id: "file123" });
    expect(parseExternalId(toExternalId(GUEST_KIND, "g9"))).toEqual({ kind: "guest", id: "g9" });
  });

  it("preserves ids that themselves contain a colon", () => {
    // indexOf split keeps everything after the first colon as the id.
    expect(parseExternalId("photo:a:b")).toEqual({ kind: "photo", id: "a:b" });
  });

  it("rejects malformed external ids", () => {
    for (const bad of [undefined, null, "", "nocolon", ":leadingcolon", "trailing:"]) {
      expect(parseExternalId(bad as string)).toBeNull();
    }
  });
});

describe("joinRekognitionMatches", () => {
  const files: PhotoFileRow[] = [
    { fileId: "a", name: "a.jpg", url: "https://x/a", type: "image/jpeg", storagePath: "p/a" },
    { fileId: "b", name: "b.jpg", url: "https://x/b", type: "image/jpeg", storagePath: "p/b" },
  ];

  const hit = (extId: string | undefined, similarity: number, faceId = "f"): RekSearchMatch => ({
    faceId,
    externalImageId: extId,
    similarity,
  });

  it("joins photo hits to files and sorts by similarity desc", () => {
    const out = joinRekognitionMatches(
      [hit("photo:a", 91.2), hit("photo:b", 97.8)],
      files,
    );
    expect(out.map((m) => m.fileId)).toEqual(["b", "a"]);
    expect(out[0].url).toBe("https://x/b");
    expect(out[0].similarity).toBeCloseTo(97.8, 2);
  });

  it("dedupes to one row per photo, keeping the best similarity", () => {
    const out = joinRekognitionMatches(
      [hit("photo:a", 88, "f1"), hit("photo:a", 95, "f2"), hit("photo:a", 90, "f3")],
      files,
    );
    expect(out).toHaveLength(1);
    expect(out[0].similarity).toBeCloseTo(95, 2);
  });

  it("ignores guest faces and unknown external-id kinds", () => {
    const out = joinRekognitionMatches(
      [hit("guest:g1", 99), hit("other:x", 99), hit("photo:a", 90)],
      files,
    );
    expect(out.map((m) => m.fileId)).toEqual(["a"]);
  });

  it("drops hits whose photo metadata is gone or malformed", () => {
    const out = joinRekognitionMatches(
      [hit("photo:missing", 99), hit(undefined, 99), hit("photo:b", 90)],
      files,
    );
    expect(out.map((m) => m.fileId)).toEqual(["b"]);
  });
});
