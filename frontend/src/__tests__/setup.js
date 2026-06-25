// Vitest setup — registers @testing-library/jest-dom custom matchers
// (toBeInTheDocument, toBeDisabled, toHaveTextContent, …) for the RTL component
// tests under src/__tests__/components/.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// This project doesn't enable Vitest `globals`, so RTL's automatic post-test
// cleanup (which hooks the global afterEach) never runs — unmount explicitly so
// each test starts with a fresh DOM. A no-op for the non-component test files.
afterEach(() => cleanup());

