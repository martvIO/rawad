// Unit tests for the engine-selection config (faceIndex/config.ts). Pure env
// logic — no AWS, no emulator.
import { describe, it, expect, afterEach } from "vitest";
import {
  isRekognitionConfigured,
  activeIndexVersion,
  REKOGNITION_INDEX_VERSION,
} from "../../functions/src/faceIndex/config";

const KEYS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"] as const;
const SAVED = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

function setAll() {
  process.env.AWS_ACCESS_KEY_ID = "AKIA_test";
  process.env.AWS_SECRET_ACCESS_KEY = "secret_test";
  process.env.AWS_REGION = "eu-west-1";
}

describe("isRekognitionConfigured", () => {
  it("is true only when all three AWS env vars are present", () => {
    setAll();
    expect(isRekognitionConfigured()).toBe(true);
  });

  it("is false when any one is missing", () => {
    for (const missing of KEYS) {
      setAll();
      delete process.env[missing];
      expect(isRekognitionConfigured()).toBe(false);
    }
  });

  it("is false with none set", () => {
    for (const k of KEYS) delete process.env[k];
    expect(isRekognitionConfigured()).toBe(false);
  });
});

describe("activeIndexVersion", () => {
  it("returns the Rekognition version when configured", () => {
    setAll();
    expect(activeIndexVersion("faceapi-frn-v1")).toBe(REKOGNITION_INDEX_VERSION);
  });

  it("falls back to the passed face-api version when not configured", () => {
    for (const k of KEYS) delete process.env[k];
    expect(activeIndexVersion("faceapi-frn-v1")).toBe("faceapi-frn-v1");
  });
});
