#!/usr/bin/env node
// build-report.cjs — render the consolidated reporter's results.json into a
// human-facing dashboard (index.html) + a scannable digest (SUMMARY.md).
//
// Run after the Playwright suite (the consolidated reporter writes results.json):
//   REPORT_DIR=/abs/test-report node scripts/build-report.cjs
// or pass the dir as the first arg. No dependencies — pure Node.

const fs = require("node:fs");
const path = require("node:path");

const reportDir = path.resolve(process.env.REPORT_DIR || process.argv[2] || "test-report");
const resultsPath = path.join(reportDir, "results.json");

if (!fs.existsSync(resultsPath)) {
  console.error(`[build-report] no results.json at ${resultsPath} — did the suite run?`);
  process.exit(1);
}

const r = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ─── findings rollup ─────────────────────────────────────────────────────────
const findingsByKind = {};
for (const f of r.findings || []) {
  (findingsByKind[f.kind] ??= []).push(f);
}
const kindsSorted = Object.keys(findingsByKind).sort((a, b) => findingsByKind[b].length - findingsByKind[a].length);

const failedTests = (r.tests || []).filter((t) => t.status === "failed" || t.status === "timedOut");

// ─── markdown digest ─────────────────────────────────────────────────────────
function bar(p, total) {
  const n = total ? Math.round((p / total) * 10) : 0;
  return "#".repeat(n) + "-".repeat(10 - n);
}
let md = `# Dawa Test Report\n\n`;
md += `- Generated: ${r.generatedAt}\n- Mode: **${r.mode}** (${r.baseURL})\n- Duration: ${(r.durationMs / 1000).toFixed(1)}s\n\n`;
md += `## Overview\n\n`;
md += `**${r.totals.passed} passed / ${r.totals.failed} failed / ${r.totals.skipped} skipped** (of ${r.totals.total})\n\n`;
md += `## By area\n\n`;
for (const [area, a] of Object.entries(r.byArea || {}).sort()) {
  const tot = a.passed + a.failed + a.skipped;
  md += `- \`${area.padEnd(12)}\` [${bar(a.passed, tot)}] ${a.passed}/${tot}${a.failed ? ` · ${a.failed} failed` : ""}${a.skipped ? ` · ${a.skipped} skipped` : ""}\n`;
}
md += `\n## Findings (${(r.findings || []).length})\n\n`;
if (!(r.findings || []).length) md += `_None._\n`;
for (const kind of kindsSorted) {
  md += `### ${kind} (${findingsByKind[kind].length})\n\n`;
  for (const f of findingsByKind[kind].slice(0, 25)) {
    md += `- ${f.severity === "error" ? "🔴" : "🟡"} ${f.route ? `\`${f.route}\` — ` : ""}${f.message}\n`;
  }
  if (findingsByKind[kind].length > 25) md += `- …and ${findingsByKind[kind].length - 25} more\n`;
  md += `\n`;
}
if (failedTests.length) {
  md += `## Failed tests (${failedTests.length})\n\n`;
  for (const t of failedTests) {
    md += `- ❌ [${t.area}/${t.project}] ${t.title}${t.visualDiff ? " _(visual diff)_" : ""}\n`;
    if (t.error) md += `  - ${t.error.split("\n")[0]}\n`;
  }
}
fs.writeFileSync(path.join(reportDir, "SUMMARY.md"), md, "utf8");

// ─── HTML dashboard ──────────────────────────────────────────────────────────
const areaRows = Object.entries(r.byArea || {})
  .sort()
  .map(([area, a]) => {
    const tot = a.passed + a.failed + a.skipped;
    const pct = tot ? Math.round((a.passed / tot) * 100) : 0;
    return `<tr><td>${esc(area)}</td><td><div class="track"><div class="fill" style="width:${pct}%"></div></div></td>
      <td class="num">${a.passed}/${tot}</td><td class="num ${a.failed ? "bad" : ""}">${a.failed}</td><td class="num muted">${a.skipped}</td></tr>`;
  })
  .join("");

const findingRows = kindsSorted
  .map(
    (kind) => `<h3>${esc(kind)} <span class="pill">${findingsByKind[kind].length}</span></h3>
    <ul class="findings">${findingsByKind[kind]
      .slice(0, 50)
      .map((f) => `<li class="${f.severity}"><code>${esc(f.route || "")}</code> ${esc(f.message)}${f.test ? `<span class="muted"> — ${esc(f.test)}</span>` : ""}</li>`)
      .join("")}</ul>`,
  )
  .join("");

const failRows = failedTests
  .map(
    (t) => `<tr><td>${esc(t.area)}</td><td>${esc(t.project)}</td><td>${esc(t.title)}${t.visualDiff ? ' <span class="pill warn">visual</span>' : ""}</td>
    <td class="err">${esc((t.error || "").split("\n")[0])}</td></tr>`,
  )
  .join("");

const ok = r.totals.failed === 0;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dawa Test Report</title><style>
:root{--bg:#0f1117;--card:#181b25;--line:#272b38;--txt:#e6e8ee;--muted:#8b92a6;--good:#4cc97a;--bad:#e4574c;--warn:#d6a23a}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--txt)}
.wrap{max-width:1000px;margin:0 auto;padding:32px 20px}
h1{font-size:22px;margin:0 0 4px}h3{margin:20px 0 6px}
.sub{color:var(--muted);margin-bottom:20px}
.hero{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 22px;min-width:120px}
.stat b{font-size:28px;display:block}
.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}.muted{color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:20px}
table{width:100%;border-collapse:collapse}td,th{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.num{text-align:right;font-variant-numeric:tabular-nums}
.track{background:#11131a;border-radius:6px;height:10px;overflow:hidden;min-width:160px}.fill{background:var(--good);height:100%}
.pill{background:#2a2f3e;border-radius:20px;padding:1px 8px;font-size:12px;color:var(--muted)}.pill.warn{background:#3a2f1a;color:var(--warn)}
ul.findings{list-style:none;padding:0;margin:0}ul.findings li{padding:5px 0;border-bottom:1px solid var(--line)}
ul.findings li.error{border-left:3px solid var(--bad);padding-left:8px}ul.findings li.warning{border-left:3px solid var(--warn);padding-left:8px}
code{background:#11131a;border-radius:4px;padding:1px 5px;font-size:12px}.err{color:var(--bad);font-size:12px}
a{color:#7aa2ff}
</style></head><body><div class="wrap">
<h1>Dawa Test Report</h1>
<div class="sub">${esc(r.generatedAt)} · mode <b>${esc(r.mode)}</b> · ${esc(r.baseURL)} · ${(r.durationMs / 1000).toFixed(1)}s
 · <a href="../frontend/playwright-report/index.html">Playwright HTML (traces)</a></div>
<div class="hero">
  <div class="stat"><b class="${ok ? "good" : ""}">${r.totals.passed}</b>passed</div>
  <div class="stat"><b class="${r.totals.failed ? "bad" : "muted"}">${r.totals.failed}</b>failed</div>
  <div class="stat"><b class="muted">${r.totals.skipped}</b>skipped</div>
  <div class="stat"><b class="${(r.findings || []).length ? "warn" : "muted"}">${(r.findings || []).length}</b>findings</div>
</div>
<div class="card"><h3>By area</h3><table><thead><tr><th>Area</th><th>Pass rate</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Skip</th></tr></thead><tbody>${areaRows || '<tr><td colspan="5" class="muted">no tests</td></tr>'}</tbody></table></div>
${failedTests.length ? `<div class="card"><h3>Failed tests <span class="pill warn">${failedTests.length}</span></h3><table><thead><tr><th>Area</th><th>Project</th><th>Test</th><th>Error</th></tr></thead><tbody>${failRows}</tbody></table></div>` : ""}
<div class="card"><h3>Findings</h3>${findingRows || '<p class="muted">No findings — clean run.</p>'}</div>
</div></body></html>`;

fs.writeFileSync(path.join(reportDir, "index.html"), html, "utf8");
console.log(`[build-report] → ${path.join(reportDir, "index.html")}`);
console.log(`[build-report] → ${path.join(reportDir, "SUMMARY.md")}`);
