#!/usr/bin/env node
// Cross-platform helper: builds Cloud Functions TypeScript before firebase deploy.
// Called from firebase.json "predeploy" so firebase-tools doesn't have to
// invoke npm through a shell (which breaks on Windows with cross-spawn).
const { execSync } = require("child_process");
const { rmSync, existsSync, copyFileSync, mkdirSync } = require("fs");
const path = require("path");

const repoRoot     = path.join(__dirname, "..", "..");
const functionsDir = path.join(__dirname, "..", "functions");
const distHtml     = path.join(repoRoot, "frontend", "dist", "index.html");

// ─── Frontend build (deploy path only) ─────────────────────────────────────
//
// `firebase deploy` runs the FUNCTIONS predeploy BEFORE the HOSTING one, so the
// dist/index.html copied below used to be whatever the last build happened to
// leave on disk — one build old — while hosting then uploaded a freshly-built
// dist under different chunk hashes. digitalInvitePreview/digitalOgImage then
// served a shell pointing at JS that no longer existed on /d/** and /invite/**
// (TASK-DEPLOY-1 — the main feeder of the /assets stale-chunk problem, since a
// missing chunk is exactly what the SPA catch-all answers with index.html).
// Building the frontend here, before the copy, makes a stale bundle impossible
// regardless of predeploy ordering.
//
// Gated on RESOURCE_DIR — set only by firebase-tools' predeploy hook runner
// (lib/deploy/lifecycleHooks.js), never by a plain shell — because the direct
// callers of this script (CI ×3, `npm run emulators:build`, `npm run test:api`)
// want tsc only; a production vite build would tax the dev loop for nothing.
// DAWA_BUILD_FRONTEND=1/0 forces it on/off for anything that needs to opt out.
//
// The hosting predeploy (build-vite.cjs) still rebuilds dist afterwards. That
// second build is redundant but harmless: vite output is content-hashed and this
// config embeds no timestamp or commit, so it reproduces a byte-identical
// index.html — what we bundle is what hosting serves. Skipping it would take a
// stamp check inside build-vite.cjs, which the hosting predeploy owns; that is a
// ~40 s optimisation, whereas guessing wrong here ships a broken shell.
const forceFrontend = process.env.DAWA_BUILD_FRONTEND;
const buildFrontend = forceFrontend === "1"
  || (forceFrontend !== "0" && Boolean(process.env.RESOURCE_DIR));

if (buildFrontend) {
  console.log("[build-functions] building frontend first so the bundled index.html matches the assets hosting will serve…");
  // Runs BEFORE the lib/ wipe below: a frontend build failure aborts the deploy,
  // and there is no reason to leave a destroyed lib/ behind when it does.
  //
  // Spawned as a child process, not require()'d — build-vite.cjs is an async IIFE,
  // so requiring it would return before the build finished and race the copy.
  // Delegating to it (rather than calling vite here) keeps ONE definition of how
  // this repo builds the frontend, including its pkg-node import() workaround.
  execSync(`"${process.execPath}" "${path.join(repoRoot, "frontend", "scripts", "build-vite.cjs")}"`, {
    cwd: repoRoot,
    stdio: ["ignore", "inherit", "inherit"],
  });
}

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

// Bundle dist/index.html with the function so digitalInvitePreview can read it at
// runtime to inject Open Graph tags. On the deploy path we just built dist, so
// this copy is current by construction.
const bundledHtmlDir  = path.join(functionsDir, "lib");
const bundledHtmlPath = path.join(bundledHtmlDir, "index.html");
if (existsSync(distHtml)) {
  if (!existsSync(bundledHtmlDir)) mkdirSync(bundledHtmlDir, { recursive: true });
  copyFileSync(distHtml, bundledHtmlPath);
  console.log("[build-functions] bundled dist/index.html → functions/lib/index.html");
} else if (buildFrontend) {
  // The build above reported success yet produced no index.html — bundling
  // nothing would hand every OG-fallback request a 500 (loadBundledHtml throws).
  // Fail the predeploy instead of shipping that.
  throw new Error("[build-functions] dist/index.html missing after the frontend build — aborting deploy");
} else {
  // Off the deploy path (CI, emulators) this is expected and harmless: the
  // emulator's digitalInvitePreview live-fetches index.html from the dev server.
  console.log("[build-functions] dist/index.html not found — skipping bundle (run `npm run build` first if you need the OG-preview fallback)");
}
