// Unit tests for the face-photos service (Rekognition flow). The api + poller
// modules are mocked so no fetch fires.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../utils/apiClient.js", () => {
  const api = { get: vi.fn(), post: vi.fn(), delete: vi.fn(), upload: vi.fn() };
  return { api, buildApiUrl: (p) => `/api${p}` };
});
vi.mock("../../utils/poller.js", () => ({
  createPoller: vi.fn((fetchFn, cb) => {
    Promise.resolve().then(async () => { try { cb(await fetchFn()); } catch { /* noop */ } });
    return () => {};
  }),
}));
vi.mock("../../config/index.js", () => ({ POLL_MS: { DIGITAL: 15000 } }));

import { api } from "../../utils/apiClient.js";
import { createPoller } from "../../utils/poller.js";
import {
  subscribeFaceMatches,
  createLivenessSession,
  enrollSelfieUpload,
  enrollWithLiveness,
  deleteFaceEnrollment,
  photosZipUrl,
} from "../../services/digitalPhotos.js";

const TOKEN = "ab".repeat(16);

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ published: true, enrolled: false, matches: [] });
  api.post.mockResolvedValue({ ok: true });
  api.upload.mockResolvedValue({ ok: true, matches: [] });
  api.delete.mockResolvedValue({ ok: true });
});

describe("createLivenessSession", () => {
  it("POSTs to the liveness session endpoint with the token in query + body", async () => {
    await createLivenessSession(TOKEN);
    expect(api.post).toHaveBeenCalledWith(
      `/digital/photos/liveness/session?token=${TOKEN}`,
      { token: TOKEN },
      { skipAuth: true },
    );
  });
});

describe("enrollSelfieUpload", () => {
  it("uploads FormData with token (query+field), phone and selfie file", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "me.jpg", { type: "image/jpeg" });
    await enrollSelfieUpload(TOKEN, file, "0501234567");
    expect(api.upload).toHaveBeenCalledTimes(1);
    const [path, fd, opts] = api.upload.mock.calls[0];
    expect(path).toBe(`/digital/photos/enroll?token=${TOKEN}`);
    expect(opts).toEqual({ skipAuth: true });
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get("token")).toBe(TOKEN);
    expect(fd.get("phone")).toBe("0501234567");
    expect(fd.get("selfie")).toBeInstanceOf(File);
  });

  it("omits the phone field when none is given", async () => {
    const file = new File([new Uint8Array([1])], "me.jpg", { type: "image/jpeg" });
    await enrollSelfieUpload(TOKEN, file, "");
    const [, fd] = api.upload.mock.calls[0];
    expect(fd.get("phone")).toBeNull();
  });
});

describe("enrollWithLiveness", () => {
  it("POSTs token + livenessSessionId + phone as JSON", async () => {
    await enrollWithLiveness(TOKEN, "sess-1", "0501234567");
    expect(api.post).toHaveBeenCalledWith(
      "/digital/photos/enroll",
      { token: TOKEN, livenessSessionId: "sess-1", phone: "0501234567" },
      { skipAuth: true },
    );
  });
});

describe("deleteFaceEnrollment", () => {
  it("DELETEs the enroll endpoint with the token", async () => {
    await deleteFaceEnrollment(TOKEN);
    expect(api.delete).toHaveBeenCalledWith("/digital/photos/enroll", { token: TOKEN }, { skipAuth: true });
  });
});

describe("photosZipUrl", () => {
  it("builds the absolute zip URL with the encoded token", () => {
    expect(photosZipUrl(TOKEN)).toBe(`/api/digital/photos/zip?token=${TOKEN}`);
  });
});

describe("subscribeFaceMatches", () => {
  it("polls the matches endpoint and forwards the state", async () => {
    const cb = vi.fn();
    subscribeFaceMatches(TOKEN, cb);
    expect(createPoller).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0)); // flush the poller's async tick
    expect(api.get).toHaveBeenCalledWith(
      `/digital/photos/matches?token=${TOKEN}`,
      { skipAuth: true },
    );
    expect(cb).toHaveBeenCalledWith({ published: true, enrolled: false, matches: [] });
  });
});
