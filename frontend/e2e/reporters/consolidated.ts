// Consolidated reporter — turns the whole multi-layer run into ONE machine
// artifact (test-report/results.json) that build-report.cjs renders to HTML +
// markdown and file-issues.cjs turns into deduped GitHub issues.
//
// It is additive: the native `list` + `html` reporters still run (see
// playwright.config.ts). This one harvests, per test:
//   • outcome + duration + project + the logical AREA (from the file path)
//   • every `finding` attachment (console errors, broken images, leaked i18n
//     keys, dead links, a11y violations…) emitted via helpers/findings.ts
//   • visual-regression diffs (attachments Playwright adds on toHaveScreenshot
//     failure: "*-expected", "*-actual", "*-diff").

import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, basename, sep } from "node:path";

interface OutFinding {
  kind: string;
  severity: string;
  area: string;
  route?: string;
  message: string;
  detail?: string;
  test: string;
  project: string;
}

interface OutTest {
  title: string;
  area: string;
  project: string;
  file: string;
  status: TestResult["status"];
  expected: "pass" | "fail";
  durationMs: number;
  error?: string;
  visualDiff?: boolean;
  retries: number;
}

function areaOf(file: string): string {
  const parts = file.split(sep);
  const i = parts.findIndex((p) => p === "features" || p === "journeys" || p === "crawler");
  if (i >= 0) {
    if (parts[i] === "features") return parts[i + 1]?.replace(/\.spec\.[tj]s$/, "") ?? "features";
    return parts[i]; // journeys | crawler
  }
  // Top-level spec like admin.spec.ts / rtl.spec.ts → strip suffix.
  return basename(file).replace(/\.spec\.[tj]s$/, "").replace(/\.[tj]s$/, "");
}

export default class ConsolidatedReporter implements Reporter {
  private tests: OutTest[] = [];
  private findings: OutFinding[] = [];
  private startedAt = 0;
  private reportDir = process.env.REPORT_DIR
    ? resolve(process.env.REPORT_DIR)
    : resolve(process.cwd(), "test-report");

  onBegin(_config: FullConfig, _suite: Suite): void {
    // Date.now is fine in a reporter (runs in the host process, not a workflow).
    this.startedAt = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const file = test.location.file;
    const area = areaOf(file);
    const project = test.parent.project()?.name ?? "default";
    const title = test.titlePath().slice(3).join(" › ") || test.title; // drop ['', project, file]

    const visualDiff = result.attachments.some((a) => /-(diff|actual|expected)\.png$/.test(a.name) || a.name === "diff");

    // Harvest structured findings.
    for (const att of result.attachments) {
      if (att.name !== "finding" || !att.body) continue;
      try {
        const f = JSON.parse(att.body.toString("utf8"));
        this.findings.push({
          kind: f.kind ?? "other",
          severity: f.severity ?? "warning",
          area: f.area ?? area,
          route: f.route,
          message: f.message ?? "",
          detail: f.detail,
          test: title,
          project,
        });
      } catch {
        /* ignore malformed finding */
      }
    }

    this.tests.push({
      title,
      area,
      project,
      file: basename(file),
      status: result.status,
      expected: test.expectedStatus === "passed" ? "pass" : "fail",
      durationMs: result.duration,
      error: result.error?.message?.replace(/\[[0-9;]*m/g, "").slice(0, 800),
      visualDiff: visualDiff || undefined,
      retries: result.retry,
    });
  }

  onEnd(result: FullResult): void {
    const finishedAt = Date.now();
    // De-dup retries: keep the FINAL attempt per (title+project).
    const finalByKey = new Map<string, OutTest>();
    for (const t of this.tests) {
      const key = `${t.project}::${t.title}`;
      const prev = finalByKey.get(key);
      if (!prev || t.retries >= prev.retries) finalByKey.set(key, t);
    }
    const tests = [...finalByKey.values()];

    const passed = tests.filter((t) => t.status === "passed").length;
    const failed = tests.filter((t) => t.status === "failed" || t.status === "timedOut").length;
    const skipped = tests.filter((t) => t.status === "skipped").length;

    const byArea: Record<string, { passed: number; failed: number; skipped: number }> = {};
    for (const t of tests) {
      const a = (byArea[t.area] ??= { passed: 0, failed: 0, skipped: 0 });
      if (t.status === "passed") a.passed++;
      else if (t.status === "skipped") a.skipped++;
      else a.failed++;
    }

    const summary = {
      generatedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - this.startedAt,
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
      mode: process.env.PROD_SMOKE ? "prod-smoke" : "emulator",
      status: result.status,
      totals: { passed, failed, skipped, total: tests.length },
      byArea,
      findings: this.findings,
      visualDiffs: tests.filter((t) => t.visualDiff).map((t) => ({ title: t.title, project: t.project, area: t.area })),
      tests,
    };

    mkdirSync(this.reportDir, { recursive: true });
    writeFileSync(resolve(this.reportDir, "results.json"), JSON.stringify(summary, null, 2), "utf8");
    // eslint-disable-next-line no-console
    console.log(`\n[consolidated] results.json → ${resolve(this.reportDir, "results.json")}`);
    // eslint-disable-next-line no-console
    console.log(
      `[consolidated] ${passed} passed / ${failed} failed / ${skipped} skipped · ${this.findings.length} findings`,
    );
  }
}
