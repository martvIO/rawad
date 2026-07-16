import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

// firebase-admin is a dependency of backend/functions, NOT of this test package,
// so a bare `firebase-admin/*` specifier resolves from functions/src but NOT from
// tests/. That asymmetry silently breaks vi.mock(): a mock registered in a test
// lands under a different module id than the one the route imports, so it never
// applies and the real SDK runs (typically throwing into a route's catch-all and
// making I/O assertions pass vacuously). Aliasing both sides to the one physical
// copy makes the ids match. It points at the same package the source already got,
// so nothing about how the code runs changes.
const firebaseAdminAlias = [
  {
    find: /^firebase-admin\/(app|auth|database|firestore|storage|messaging)$/,
    replacement: resolve(here, "functions/node_modules/firebase-admin/lib/$1/index.js"),
  },
];

// Backend test projects (frontend unit tests live in frontend/vitest.config.js):
//   unit        — Cloud Functions pure-logic tests (helpers, rate limits,
//                 authz, face matching). node env, no emulators. Run via the
//                 root `npm run test:unit` alias.
//   integration — security-rule tests against the Firebase emulator. node env.
//                 Run with `npm test` (wrapped in `firebase emulators:exec`).
// `root` is pinned to backend/ so include globs resolve correctly when vitest
// is invoked from the repo root with `-c backend/vitest.config.js`.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  test: {
    projects: [
      {
        resolve: { alias: firebaseAdminAlias },
        test: {
          name: "unit",
          // Glob (not an explicit list) so new pure-logic tests under
          // tests/functions/ are picked up automatically — an explicit list
          // silently dropped newly-added tests.
          include: ["tests/functions/**/*.test.{ts,js}"],
          environment: "node",
          testTimeout: 10000,
        },
      },
      {
        test: {
          name: "integration",
          include: [
            "tests/database.test.js",
            "tests/rules/**/*.test.{js,ts}",
          ],
          environment: "node",
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
      {
        // REST API route tests — hit the Express app served by the Functions
        // emulator over HTTP (the same boundary the browser uses). Needs the
        // FULL emulator suite (auth+db+firestore+storage+functions) AND the
        // seed accounts, so it's EXCLUDED from `test:unit` / `npm test` and run
        // via the root `npm run test:api` (emulators:exec + build + seed).
        // fileParallelism off → deterministic shared-emulator-data ordering.
        test: {
          name: "api",
          include: ["tests/api/**/*.test.{js,ts}"],
          environment: "node",
          testTimeout: 30000,
          hookTimeout: 30000,
          fileParallelism: false,
        },
      },
      {
        // Real-AWS Rekognition accuracy tests over the facerec_examples
        // fixtures. EXCLUDED from `test:unit` and `npm test` (CI) — they call
        // the live service, need AWS creds, and cost a few cents. Run locally
        // with `npm run test:rekognition`; the suite skips itself when creds
        // are absent.
        test: {
          name: "rekognition",
          include: ["tests/rekognition/**/*.test.{js,ts}"],
          environment: "node",
          testTimeout: 180000,
          hookTimeout: 180000,
        },
      },
    ],
  },
});
