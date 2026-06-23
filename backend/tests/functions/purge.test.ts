// @vitest-environment node
//
// Regression test for the biometric-purge "stamp only on success" invariant.
//
// purgeWeddingFaces() deletes the wedding's AWS Rekognition collection (the only
// copy of the biometric face vectors — it can't be TTL'd) and then stamps
// facesPurgedAt on the wedding doc. The daily scheduled job SKIPS any wedding
// that already carries facesPurgedAt. So if the AWS delete fails but we stamp
// anyway, the faces persist in AWS forever and are never retried — a silent
// breach of the 30-day privacy commitment. The stamp must land ONLY when the
// AWS delete (and the Firestore clears) actually succeeded.
//
// We test purgeWeddingFacesWith — the dependency-injected core — with a fake
// Firestore + AWS deleter, so no live Firestore/AWS (or module mocks) are needed.
import { describe, it, expect } from "vitest";
import { purgeWeddingFacesWith } from "../../functions/src/faceIndex/purge";

// Minimal Firestore stand-in: collection().get() yields no docs (clearCollection
// is then a no-op loop); doc().set() records each merge payload so we can assert
// whether the purge stamp was written.
function fakeFs(setCalls: Array<Record<string, unknown>>) {
  return {
    collection: () => ({ get: async () => ({ docs: [] as unknown[] }) }),
    doc: () => ({
      set: async (data: Record<string, unknown>) => {
        setCalls.push(data);
      },
    }),
    batch: () => ({ delete: () => {}, commit: async () => {} }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("purgeWeddingFacesWith — stamp only on success", () => {
  it("stamps facesPurgedAt when the AWS collection delete succeeds", async () => {
    const setCalls: Array<Record<string, unknown>> = [];
    await purgeWeddingFacesWith(fakeFs(setCalls), "groom1", async () => {});
    expect(setCalls.length).toBe(1);
    expect(setCalls[0]).toHaveProperty("facesPurgedAt");
  });

  it("does NOT stamp facesPurgedAt when the AWS collection delete fails", async () => {
    const setCalls: Array<Record<string, unknown>> = [];
    const failingDelete = async () => {
      throw new Error("aws_throttled");
    };
    // Must propagate so the scheduler's .catch leaves the wedding unstamped and
    // retries it next run — instead of silently marking it purged.
    await expect(
      purgeWeddingFacesWith(fakeFs(setCalls), "groom1", failingDelete),
    ).rejects.toThrow("aws_throttled");
    expect(setCalls.length).toBe(0);
  });

  it("still purges (Firestore-only) when Rekognition is not configured", async () => {
    const setCalls: Array<Record<string, unknown>> = [];
    await purgeWeddingFacesWith(fakeFs(setCalls), "groom1", null);
    expect(setCalls.length).toBe(1);
    expect(setCalls[0]).toHaveProperty("facesPurgedAt");
  });
});
