#!/usr/bin/env node
// file-issues.cjs — turn the consolidated report's failures + error-findings into
// DEDUPED GitHub issues via `gh`. Each problem gets a stable signature embedded
// in the issue body (`<!-- dawa-test-sig: … -->`); on later runs an existing open
// issue with the same signature is left alone (no duplicate, no spam).
//
//   REPORT_DIR=/abs/test-report node scripts/file-issues.cjs
//
// Safe by default: if `gh` is missing / unauthenticated, it warns and exits 0.
// A per-run creation cap prevents a first-run flood (logged, never silent).

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const reportDir = path.resolve(process.env.REPORT_DIR || process.argv[2] || "test-report");
const resultsPath = path.join(reportDir, "results.json");
const LABEL = "dawa-test";
const CREATE_CAP = Number(process.env.ISSUE_CAP || 25);

function gh(args, opts = {}) {
  return spawnSync("gh", args, { encoding: "utf8", shell: true, ...opts });
}

function ghAvailable() {
  const v = gh(["--version"]);
  if (v.status !== 0) return false;
  const auth = gh(["auth", "status"]);
  return auth.status === 0;
}

/** Stable signature: kind+area+route + message with run-specific tokens masked. */
function signature(p) {
  const norm = (p.message || "")
    .replace(/0x[0-9a-f]+/gi, "#")
    .replace(/[0-9a-f]{16,}/gi, "#")
    .replace(/\d+/g, "#")
    .slice(0, 120);
  const raw = `${p.kind}|${p.area}|${(p.route || "").replace(/\d+/g, "#")}|${norm}`;
  // djb2 hash → short hex.
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

if (!fs.existsSync(resultsPath)) {
  console.error(`[file-issues] no results.json at ${resultsPath}`);
  process.exit(0);
}
if (!ghAvailable()) {
  console.warn("[file-issues] gh CLI not available/authenticated — skipping issue filing.");
  process.exit(0);
}

const r = JSON.parse(fs.readFileSync(resultsPath, "utf8"));

// Build the problem set: failed tests + error-severity findings.
const problems = [];
for (const t of r.tests || []) {
  if (t.status === "failed" || t.status === "timedOut") {
    problems.push({
      kind: t.visualDiff ? "visual-diff" : "test-failure",
      area: t.area,
      route: t.title,
      message: (t.error || "test failed").split("\n")[0],
      detail: t.error,
      title: `[${t.area}] ${t.visualDiff ? "Visual diff" : "Test failing"}: ${t.title}`,
    });
  }
}
for (const f of r.findings || []) {
  if (f.severity !== "error") continue;
  problems.push({
    kind: f.kind,
    area: f.area,
    route: f.route,
    message: f.message,
    detail: f.detail,
    title: `[${f.area}] ${f.kind}: ${f.message}`.slice(0, 110),
  });
}

// De-dup within this run by signature.
const bySig = new Map();
for (const p of problems) {
  const sig = signature(p);
  if (!bySig.has(sig)) bySig.set(sig, { ...p, sig });
}

// Existing open issues with our label.
const list = gh(["issue", "list", "--label", LABEL, "--state", "open", "--json", "number,body", "--limit", "300"]);
const existing = new Set();
if (list.status === 0) {
  try {
    for (const it of JSON.parse(list.stdout)) {
      const m = /dawa-test-sig:\s*([0-9a-f]+)/.exec(it.body || "");
      if (m) existing.add(m[1]);
    }
  } catch {
    /* ignore */
  }
}

let created = 0;
let skipped = 0;
let capped = 0;
for (const [sig, p] of bySig) {
  if (existing.has(sig)) {
    skipped++;
    continue;
  }
  if (created >= CREATE_CAP) {
    capped++;
    continue;
  }
  const body =
    `Auto-filed by the comprehensive test suite (\`npm run test:full\`).\n\n` +
    `- **Area:** ${p.area}\n- **Kind:** ${p.kind}\n- **Where:** ${p.route || "n/a"}\n\n` +
    `**Detail**\n\n\`\`\`\n${(p.detail || p.message || "").slice(0, 1500)}\n\`\`\`\n\n` +
    `See the run's \`test-report/index.html\` + Playwright trace for the failing step.\n\n` +
    `<!-- dawa-test-sig: ${sig} -->`;
  const res = gh([
    "issue", "create",
    "--title", p.title,
    "--body", body,
    "--label", LABEL,
    "--label", `area:${p.area}`,
  ]);
  if (res.status === 0) {
    created++;
    console.log(`[file-issues] created: ${p.title}`);
  } else {
    console.warn(`[file-issues] create failed (${res.status}): ${(res.stderr || "").trim().split("\n")[0]}`);
  }
}

console.log(`[file-issues] ${created} created, ${skipped} already tracked${capped ? `, ${capped} over the ${CREATE_CAP} cap (rerun to file the rest)` : ""}.`);
