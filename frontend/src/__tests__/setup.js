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

setEnv(import.meta.env);
setStorage(webStorage);

// This project doesn't enable Vitest `globals`, so RTL's automatic post-test
// cleanup (which hooks the global afterEach) never runs — unmount explicitly so
// each test starts with a fresh DOM. A no-op for the non-component test files.
afterEach(() => cleanup());

