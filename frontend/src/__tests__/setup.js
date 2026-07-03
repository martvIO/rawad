// Vitest setup — registers @testing-library/jest-dom custom matchers
// (toBeInTheDocument, toBeDisabled, toHaveTextContent, …) for the RTL component
// tests under src/__tests__/components/.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Wire the @dawa/core platform adapters for the test environment (jsdom gives
// us localStorage). setupFiles run before any test module is imported, so
// shared modules that read env/storage at load see the wired adapters.
import { setEnv } from "@dawa/core/adapters/env.js";
import { setStorage } from "@dawa/core/adapters/storage.js";
import { webStorage } from "../adapters/webStorage.js";

// Node >=22.4 pre-defines experimental `localStorage`/`sessionStorage` getters
// that return `undefined` without --localstorage-file; vitest's jsdom
// environment skips globalThis keys the Node runtime already owns, so jsdom's
// working implementations never land. Install an in-memory DOM-Storage
// polyfill so tests see the same behavior as a browser.
class MemoryStorage {
  #map = new Map();
  get length() {
    return this.#map.size;
  }
  key(i) {
    return [...this.#map.keys()][i] ?? null;
  }
  getItem(k) {
    const key = String(k);
    return this.#map.has(key) ? this.#map.get(key) : null;
  }
  setItem(k, v) {
    this.#map.set(String(k), String(v));
  }
  removeItem(k) {
    this.#map.delete(String(k));
  }
  clear() {
    this.#map.clear();
  }
}
for (const key of ["localStorage", "sessionStorage"]) {
  if (globalThis[key] === undefined) {
    Object.defineProperty(globalThis, key, {
      value: new MemoryStorage(),
      writable: true,
      configurable: true,
    });
  }
}

setEnv(import.meta.env);
setStorage(webStorage);

// This project doesn't enable Vitest `globals`, so RTL's automatic post-test
// cleanup (which hooks the global afterEach) never runs — unmount explicitly so
// each test starts with a fresh DOM. A no-op for the non-component test files.
afterEach(() => cleanup());

