// Unit tests for the People-gallery service. The api module is mocked so no
// fetch fires. Focus: the OTP/grant calls send the right path + body, and
// verify-otp threads the affirmative biometric `consent` flag.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@dawa/core/utils/apiClient.js", () => {
  const api = { get: vi.fn(), post: vi.fn() };
  return { api, buildApiUrl: (p) => `/api${p}` };
});

import { api } from "@dawa/core/utils/apiClient.js";
import {
  requestGalleryOtp,
  verifyGalleryOtp,
  fetchGalleryPeople,
} from "../../services/peopleGallery.js";

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ config: {}, people: [] });
  api.post.mockResolvedValue({ ok: true });
});

describe("requestGalleryOtp", () => {
  it("POSTs phone + recaptcha to the request-otp endpoint", async () => {
    await requestGalleryOtp("ali", "+972500000000", "rc-tok");
    expect(api.post).toHaveBeenCalledWith(
      "/digital/gallery/ali/request-otp",
      { phoneE164: "+972500000000", recaptchaToken: "rc-tok" },
      { skipAuth: true },
    );
  });
});

describe("verifyGalleryOtp", () => {
  it("sends consent:false by default", async () => {
    await verifyGalleryOtp("ali", "sess", "123456");
    expect(api.post).toHaveBeenCalledWith(
      "/digital/gallery/ali/verify-otp",
      { sessionInfo: "sess", code: "123456", consent: false },
      { skipAuth: true },
    );
  });

  it("sends consent:true only when the viewer has affirmed", async () => {
    await verifyGalleryOtp("ali", "sess", "123456", true);
    expect(api.post).toHaveBeenCalledWith(
      "/digital/gallery/ali/verify-otp",
      { sessionInfo: "sess", code: "123456", consent: true },
      { skipAuth: true },
    );
  });
});

describe("fetchGalleryPeople", () => {
  it("GETs the gallery with the encoded grant token", async () => {
    await fetchGalleryPeople("ali", "grant-xyz");
    expect(api.get).toHaveBeenCalledWith(
      "/digital/gallery/ali?galleryToken=grant-xyz",
      { skipAuth: true },
    );
  });
});
