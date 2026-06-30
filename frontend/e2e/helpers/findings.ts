// Structured findings sink — the spine of the consolidated feedback report.
//
// Any spec (feature test, crawler, i18n/a11y check) emits "findings" — a typed
// record of something noteworthy on a page (a console error, a broken image, an
// untranslated i18n key leaking to the UI, a dead link, an a11y violation…).
// Findings are attached to the Playwright TestInfo so they ride along with the
// normal test result; the custom reporter (e2e/reporters/consolidated.ts) then
// harvests every attachment named `finding` and folds them into one report.
//
// Keeping findings INSIDE the Playwright result model (rather than a side file)
// means no cross-process race conditions and traces/video stay correlated.

import type { TestInfo } from "@playwright/test";

export type FindingSeverity = "error" | "warning" | "info";

export type FindingKind =
  | "console-error"
  | "page-error"
  | "http-error"
  | "broken-image"
  | "untranslated-key"
  | "dead-link"
  | "unlabeled-control"
  | "a11y"
  | "missing-element"
  | "visual-diff"
  | "other";

export interface Finding {
  kind: FindingKind;
  severity: FindingSeverity;
  /** Logical area: admin | groom | driver | public | auth | api | crawler | i18n | a11y */
  area?: string;
  /** Route / URL where it surfaced. */
  route?: string;
  /** One-line human summary. */
  message: string;
  /** Optional longer detail (stack, request URL, key name…). */
  detail?: string;
}

export const FINDING_ATTACHMENT = "finding";

/** Attach a single structured finding to the current test. */
export async function reportFinding(testInfo: TestInfo, finding: Finding): Promise<void> {
  await testInfo.attach(FINDING_ATTACHMENT, {
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(finding), "utf8"),
  });
}

/** Attach many findings at once. */
export async function reportFindings(testInfo: TestInfo, findings: Finding[]): Promise<void> {
  for (const f of findings) await reportFinding(testInfo, f);
}
