// Unit tests for the localStorage wrappers — must degrade gracefully when
// storage is unavailable (private mode, quota, disabled).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { load, save, removeKey } from "../../utils/storage.js";

describe("storage helpers", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  describe("save + load round-trip", () => {
    it("stores and retrieves an object", () => {
      save("k", { a: 1, b: "two" });
      expect(load("k", null)).toEqual({ a: 1, b: "two" });
    });

    it("stores and retrieves a number", () => {
      save("n", 42);
      expect(load("n", 0)).toBe(42);
    });

    it("stores and retrieves a boolean", () => {
      save("b", true);
      expect(load("b", false)).toBe(true);
    });

    it("stores and retrieves an array", () => {
      save("arr", [1, 2, 3]);
      expect(load("arr", [])).toEqual([1, 2, 3]);
    });

    it("stores and retrieves a string", () => {
      save("s", "hello");
      expect(load("s", "")).toBe("hello");
    });
  });

  describe("load", () => {
    it("returns the fallback for a missing key", () => {
      expect(load("missing", "fb")).toBe("fb");
    });

    it("returns the fallback for malformed JSON", () => {
      localStorage.setItem("bad", "{not valid json");
      expect(load("bad", "fb")).toBe("fb");
    });

    it("returns the fallback when localStorage.getItem throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("storage disabled");
      });
      expect(load("k", "fb")).toBe("fb");
    });

    it("returns a stored null value rather than the fallback", () => {
      save("nullkey", null);
      expect(load("nullkey", "fb")).toBeNull();
    });
  });

  describe("save", () => {
    it("does not throw when localStorage.setItem throws", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });
      expect(() => save("k", { a: 1 })).not.toThrow();
    });
  });

  describe("removeKey", () => {
    it("removes a stored key", () => {
      save("k", "value");
      removeKey("k");
      expect(load("k", "fb")).toBe("fb");
    });

    it("does not throw for a key that was never stored", () => {
      expect(() => removeKey("never-existed")).not.toThrow();
    });

    it("does not throw when localStorage.removeItem throws", () => {
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("storage disabled");
      });
      expect(() => removeKey("k")).not.toThrow();
    });
  });
});
