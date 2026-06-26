import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve @dawa/core (shared DOM-free core) the same way vite.config.js does,
// so moved utils/services resolve under the jsdom unit tests. The alias is set
// both at the root and inside the project, since Vitest projects don't inherit
// the root `resolve` automatically.
const corePath = fileURLToPath(new URL("../shared/src", import.meta.url));
const reactPath = fileURLToPath(new URL("./node_modules/react", import.meta.url));
const reactDomPath = fileURLToPath(new URL("./node_modules/react-dom", import.meta.url));
// Shared-core files import `react` by bare name; resolve it (and react-dom) from
// the frontend's copy since shared/ is outside frontend/node_modules.
const coreAlias = {
  "@dawa/core": corePath,
  react: reactPath,
  "react-dom": reactDomPath,
};

// Frontend unit tests — pure logic (utils, data, services). jsdom env, no
// emulators. Run with `npm run test:unit` (here or via the root alias).
// Backend unit + integration tests live in backend/vitest.config.js.
export default defineConfig({
  resolve: { alias: coreAlias, dedupe: ["react", "react-dom"] },
  test: {
    projects: [
      {
        resolve: { alias: coreAlias, dedupe: ["react", "react-dom"] },
        test: {
          name: "unit",
          include: [
            "src/__tests__/utils/**/*.test.{js,ts}",
            "src/__tests__/data/**/*.test.{js,ts}",
            "src/__tests__/services/**/*.test.{js,ts}",
            "src/__tests__/i18n/**/*.test.{js,ts}",
            "src/__tests__/components/**/*.test.{js,jsx,ts,tsx}",
          ],
          environment: "jsdom",
          // jest-dom matchers (toBeDisabled, toBeInTheDocument, …) for RTL tests.
          setupFiles: ["./src/__tests__/setup.js"],
          testTimeout: 10000,
        },
      },
    ],
  },
});
