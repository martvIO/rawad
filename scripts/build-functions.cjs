#!/usr/bin/env node
// Cross-platform helper: builds Cloud Functions TypeScript before firebase deploy.
// Called from firebase.json "predeploy" so firebase-tools doesn't have to
// invoke npm through a shell (which breaks on Windows with cross-spawn).
const { execSync } = require("child_process");
const path = require("path");

// Call tsc directly — bypasses npm so the npm 10+ stdin-crash bug never triggers.
// execSync routes through cmd.exe on Windows so .cmd shims are handled correctly.
const functionsDir = path.join(__dirname, "..", "functions");
const tsc = path.join(
  functionsDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc"
);

execSync(`"${tsc}" -p tsconfig.json`, {
  cwd: functionsDir,
  stdio: ["ignore", "inherit", "inherit"],
});
