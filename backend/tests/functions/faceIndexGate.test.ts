// Unit tests for the biometric-indexing consent gate used by the photographer
// face-index trigger. `indexingDeferred(parentData)` decides whether a photo's
// faces may be indexed: deferred (no AWS call, status row only) until the
// wedding opens its gate by publishing with acknowledgment, OR for a wedding
// that was already published before the gate existed.
import { describe, it, expect } from "vitest";
import { indexingDeferred } from "../../functions/src/faceIndex/trigger";

describe("indexingDeferred — biometric consent gate", () => {
  it("defers when the parent doc is missing/empty (new, unpublished wedding)", () => {
    expect(indexingDeferred(undefined)).toBe(true);
    expect(indexingDeferred({})).toBe(true);
  });

  it("defers while neither gate flag nor publish is set", () => {
    expect(indexingDeferred({ indexingConsentGate: false })).toBe(true);
    expect(indexingDeferred({ photographerPublished: false })).toBe(true);
  });

  it("allows indexing once the consent gate is opened (publish + ack)", () => {
    expect(indexingDeferred({ indexingConsentGate: true })).toBe(false);
  });

  it("allows indexing for a wedding already published before the gate existed", () => {
    expect(indexingDeferred({ photographerPublished: true })).toBe(false);
  });

  it("requires a strict boolean true — truthy non-true values still defer", () => {
    expect(indexingDeferred({ indexingConsentGate: "yes" })).toBe(true);
    expect(indexingDeferred({ photographerPublished: 1 })).toBe(true);
  });
});
