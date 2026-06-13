// Unit tests for localizeApiError — the layer that turns the raw codes thrown
// by apiClient.js into localized, user-facing strings (so non-technical AR/HE
// users never see "api_429" / "network_error" verbatim).
import { describe, it, expect } from "vitest";
import { localizeApiError, apiErrorCode } from "../../utils/apiError.js";
import { ApiError } from "../../utils/apiClient.js";
import { makeT } from "../../i18n/index.js";

const tAr = makeT("ar");
const tHe = makeT("he");

describe("apiErrorCode — code extraction", () => {
  it("prefers the parsed body error code", () => {
    expect(apiErrorCode(new ApiError(400, { error: "duplicate_phone" }, "api_duplicate_phone")))
      .toBe("duplicate_phone");
  });
  it("strips the api_ prefix from the message when no body code", () => {
    expect(apiErrorCode(new ApiError(429, null, "api_429"))).toBe("429");
  });
  it("returns plain transport messages as-is", () => {
    expect(apiErrorCode(new Error("network_error"))).toBe("network_error");
    expect(apiErrorCode("request_timeout")).toBe("request_timeout");
  });
  it("is null-safe", () => {
    expect(apiErrorCode(null)).toBe("");
    expect(apiErrorCode(undefined)).toBe("");
  });
});

describe("localizeApiError — transport + domain mapping", () => {
  it("maps network_error to the localized 'no connection' string", () => {
    expect(localizeApiError(new Error("network_error"), tAr)).toBe(tAr("err_network"));
    expect(localizeApiError(new Error("network_error"), tHe)).toBe(tHe("err_network"));
  });
  it("maps request_timeout", () => {
    expect(localizeApiError(new Error("request_timeout"), tAr)).toBe(tAr("err_timeout"));
  });
  it("maps a 429 (numeric, no body code) to too-many-requests", () => {
    expect(localizeApiError(new ApiError(429, null, "api_429"), tAr)).toBe(tAr("err_too_many"));
  });
  it("maps a domain code carried in the body", () => {
    const e = new ApiError(409, { error: "cannot_self_delete" }, "api_cannot_self_delete");
    expect(localizeApiError(e, tAr)).toBe(tAr("err_cannot_self_delete"));
  });
  it("maps 5xx to a server-error message", () => {
    expect(localizeApiError(new ApiError(500, null, "api_500"), tAr)).toBe(tAr("err_server"));
  });
  it("NEVER returns the raw code for a known transport error", () => {
    const out = localizeApiError(new Error("network_error"), tAr);
    expect(out).not.toMatch(/network_error/);
  });
});

describe("localizeApiError — fallback behavior", () => {
  it("uses the caller's context fallback for an unrecognized code", () => {
    const e = new ApiError(400, { error: "weird_unmapped_code" }, "api_weird_unmapped_code");
    expect(localizeApiError(e, tAr, "فشل الرفع")).toBe("فشل الرفع");
  });
  it("uses err_generic when there's no fallback and the code is unknown", () => {
    const e = new ApiError(400, { error: "weird_unmapped_code" }, "api_weird_unmapped_code");
    expect(localizeApiError(e, tAr)).toBe(tAr("err_generic"));
  });
  it("accepts a lang string instead of a t() function", () => {
    expect(localizeApiError(new Error("network_error"), "he")).toBe(tHe("err_network"));
  });
});
