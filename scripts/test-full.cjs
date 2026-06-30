#!/usr/bin/env node
// test-full.cjs — one orchestrator for the comprehensive suite.
//
//   npm run test:full                 full suite vs local emulators (assumes
//                                     `npm run dev:full` is already running)
//   npm run test:full -- --prod       read-only smoke vs the live hosted site
//   npm run test:full -- --update-snapshots   refresh visual baselines
//   npm run test:full -- --project=chromium --shard=1/4   pass through to PW
//
// Sets an ABSOLUTE REPORT_DIR (repo-root/test-report) so the Playwright reporter
// (cwd=frontend) and the post-run cjs scripts (cwd=repo-root) agree on one path.
// After Playwright exits — pass OR fail — it always builds the report, optionally
// files GitHub issues, then exits with Playwright's code so CI gates correctly.

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(ROOT, "test-report");

const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const noIssues = argv.includes("--no-issues");
const fileIssues = !noIssues && (process.env.CI || argv.includes("--file-issues"));
// Everything that isn't one of our own flags is forwarded to Playwright.
const pwArgs = argv.filter((a) => !["--prod", "--no-issues", "--file-issues"].includes(a));

const env = { ...process.env, REPORT_DIR };
if (prod) {
  env.PROD_SMOKE = "1";
  env.PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "https://dawa-aa793.web.app";
  // Only tests tagged @prodsafe (render-only, never submit) run against prod.
  if (!pwArgs.some((a) => a.startsWith("--grep"))) pwArgs.push("--grep", "@prodsafe");
}

console.log(`[test-full] mode=${prod ? "prod-smoke" : "emulator"} report=${REPORT_DIR}`);
console.log(`[test-full] playwright args: ${pwArgs.join(" ") || "(default)"}`);

const pw = spawnSync("npx", ["playwright", "test", ...pwArgs], {
  cwd: path.join(ROOT, "frontend"),
  env,
  stdio: "inherit",
  shell: true,
});

// Always render the consolidated report (the reporter wrote results.json even on
// failures). Don't let a reporting hiccup mask the suite's real exit code.
spawnSync("node", [path.join(ROOT, "scripts", "build-report.cjs")], { cwd: ROOT, env, stdio: "inherit", shell: false });

if (fileIssues) {
  spawnSync("node", [path.join(ROOT, "scripts", "file-issues.cjs")], { cwd: ROOT, env, stdio: "inherit", shell: false });
} else if (!prod) {
  console.log("[test-full] (skipping GitHub issue filing — pass --file-issues or set CI=1 to enable)");
}

process.exit(pw.status == null ? 1 : pw.status);
