#!/usr/bin/env node
// Cross-platform helper: builds Cloud Functions TypeScript before firebase deploy.
// Called from firebase.json "predeploy" so firebase-tools doesn't have to
// invoke npm through a shell (which breaks on Windows with cross-spawn).
const { execSync } = require("child_process");
const path = require("path");

const functionsDir = path.join(__dirname, "..", "functions");
execSync("npm run build", { cwd: functionsDir, stdio: "inherit" });
