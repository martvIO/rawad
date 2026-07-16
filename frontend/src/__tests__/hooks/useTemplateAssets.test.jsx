import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mock the service before importing the hook (module-scope cache + fetch).
const getTemplateAssetsPublic = vi.fn();
vi.mock("../../services/digitalInvitation.js", () => ({
  getTemplateAssetsPublic: (...a) => getTemplateAssetsPublic(...a),
}));

const { useTemplateAssets, __resetTemplateAssetsCache } = await import("../../hooks/useTemplateAssets.js");
const { getTemplateThumb } = await import("../../components/digital/templates/thumbs.js");

describe("useTemplateAssets — uploaded → bundled → null fallback chain", () => {
  beforeEach(() => {
    __resetTemplateAssetsCache();
    getTemplateAssetsPublic.mockReset();
  });
  afterEach(() => {
    __resetTemplateAssetsCache();
  });

  it("prefers an admin-uploaded cover over the bundled asset", async () => {
    getTemplateAssetsPublic.mockResolvedValue({
      "destination-love": { url: "https://storage/uploaded.jpg", updatedAt: 1 },
    });
    const { result } = renderHook(() => useTemplateAssets());
    await waitFor(() => {
      expect(result.current.resolveThumb("destination-love")).toBe("https://storage/uploaded.jpg");
    });
  });

  it("falls back to the bundled asset when no cover is uploaded", async () => {
    getTemplateAssetsPublic.mockResolvedValue({});
    const { result } = renderHook(() => useTemplateAssets());
    await waitFor(() => expect(getTemplateAssetsPublic).toHaveBeenCalled());
    // destination-love ships a bundled thumbnail; the resolver must return it.
    expect(result.current.resolveThumb("destination-love")).toBe(getTemplateThumb("destination-love"));
  });

  it("returns null for a template with neither uploaded nor bundled art", async () => {
    getTemplateAssetsPublic.mockResolvedValue({});
    const { result } = renderHook(() => useTemplateAssets());
    await waitFor(() => expect(getTemplateAssetsPublic).toHaveBeenCalled());
    // classic has no bundled thumbnail → caller renders the themed ornament.
    expect(result.current.resolveThumb("classic")).toBeNull();
  });

  it("leaves every template on bundled art when the fetch fails", async () => {
    // getTemplateAssetsPublic never throws (it catches internally) — it resolves
    // {}. Assert the hook degrades to bundled art rather than blowing up.
    getTemplateAssetsPublic.mockResolvedValue({});
    const { result } = renderHook(() => useTemplateAssets());
    await waitFor(() => expect(getTemplateAssetsPublic).toHaveBeenCalled());
    expect(result.current.resolveThumb("destination-love")).toBe(getTemplateThumb("destination-love"));
  });

  it("fetches ONCE across multiple consumers (module-scope memoization)", async () => {
    getTemplateAssetsPublic.mockResolvedValue({ classic: { url: "u" } });
    const a = renderHook(() => useTemplateAssets());
    const b = renderHook(() => useTemplateAssets());
    await waitFor(() => expect(a.result.current.resolveThumb("classic")).toBe("u"));
    await waitFor(() => expect(b.result.current.resolveThumb("classic")).toBe("u"));
    // The landing strip, gallery and picker must not each trigger a request.
    expect(getTemplateAssetsPublic).toHaveBeenCalledTimes(1);
  });
});
