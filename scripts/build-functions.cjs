#!/usr/bin/env node
// Cross-platform helper: builds Cloud Functions TypeScript before firebase deploy.
// Called from firebase.json "predeploy" so firebase-tools doesn't have to
// invoke npm through a shell (which breaks on Windows with cross-spawn).
const { execSync } = require("child_process");
const { rmSync } = require("fs");
const path = require("path");

const functionsDir = path.join(__dirname, "..", "functions");

// Wipe the previous build + tsc's incremental cache before every deploy.
// `composite: true` in functions/tsconfig.json writes tsconfig.tsbuildinfo.
// If that cache survives an out-of-band deletion of lib/ (or a half-finished
// build), tsc decides everything is "up to date" and emits nothing — and
// firebase deploy then thinks brand-new exports don't exist and prompts to
// delete them. Always start from a clean slate.
rmSync(path.join(functionsDir, "lib"),                   { recursive: true, force: true });
rmSync(path.join(functionsDir, "tsconfig.tsbuildinfo"),  { force: true });

// Call tsc directly — bypasses npm so the npm 10+ stdin-crash bug never triggers.
// execSync routes through cmd.exe on Windows so .cmd shims are handled correctly.
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
