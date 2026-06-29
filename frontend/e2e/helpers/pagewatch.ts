// Page health instrumentation — shared by the crawler and the feature specs.
//
// watchPage() wires console/pageerror/response listeners onto a Page and returns
// a live collector. scanRendering() inspects the *rendered* DOM for broken
// images, raw i18n keys leaking through (a missing translation, since makeT()
// falls back to the raw key), and unlabeled interactive controls.
//
// Both return plain Finding[] arrays; the caller decides whether to attach them
// (reportFindings) and/or assert on them.

import type { Page } from "@playwright/test";
import type { Finding } from "./findings";
import { ar } from "../../src/i18n/ar.js";
import { he } from "../../src/i18n/he.js";

// Union of every translation key. A key surfacing verbatim in the UI means a
// missing string (makeT falls back to the raw key) — exactly what we want to
// catch. Only identifier-shaped keys (snake_case, len ≥ 6) are scannable to
// avoid matching ordinary prose.
const I18N_KEYS: string[] = Array.from(
  new Set([...Object.keys(ar as Record<string, unknown>), ...Object.keys(he as Record<string, unknown>)]),
).filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k) && k.length >= 6);

export interface PageWatcher {
  readonly findings: Finding[];
  /** Snapshot + clear the collected findings, stamping the current route. */
  drain(route?: string): Finding[];
}

/** Benign console noise we never want to flag. */
const CONSOLE_IGNORE = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Lit is in dev mode/i,
  /Sentry/i, // inert until DSN set; logs a notice
];

/** Failed-response statuses worth flagging. 401/403 are legitimate on guard
 * probes, so the crawler filters those contextually; here we flag 5xx + 404. */
function isHttpError(status: number): boolean {
  return status >= 500 || status === 404 || status === 429;
}

export function watchPage(page: Page): PageWatcher {
  const findings: Finding[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (CONSOLE_IGNORE.some((re) => re.test(text))) return;
    findings.push({ kind: "console-error", severity: "error", message: text.slice(0, 400) });
  });

  page.on("pageerror", (err) => {
    findings.push({
      kind: "page-error",
      severity: "error",
      message: err.message.slice(0, 400),
      detail: err.stack?.slice(0, 1200),
    });
  });

  page.on("response", (res) => {
    const status = res.status();
    if (!isHttpError(status)) return;
    const url = res.url();
    // Ignore third-party tiles/analytics that may 404 in the emulator.
    if (/google|gstatic|lemonsqueezy|amazonaws|tile|sentry/i.test(url)) return;
    findings.push({
      kind: "http-error",
      severity: status >= 500 ? "error" : "warning",
      message: `${status} ${res.request().method()} ${url.slice(0, 200)}`,
    });
  });

  return {
    findings,
    drain(route?: string) {
      const out = findings.map((f) => ({ ...f, route: f.route ?? route }));
      findings.length = 0;
      return out;
    },
  };
}

/** Inspect the rendered DOM for broken images, leaked i18n keys, unlabeled
 * controls. Pure read of the live page; safe to call after the page settles. */
export async function scanRendering(page: Page, route?: string): Promise<Finding[]> {
  const result = await page.evaluate(
    ({ keys }) => {
      const out: Array<{ kind: string; message: string; detail?: string }> = [];

      // Broken images: loaded but zero natural size. App-hosted (same-origin /
      // relative) breakage is an error; external/CDN hotlinks (unsplash, etc.)
      // are content-dependent + flaky in headless, so they're flagged as warnings.
      for (const img of Array.from(document.images)) {
        if (img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src)) {
          const src = img.currentSrc || img.src;
          const external = /^https?:\/\//i.test(src) && !src.startsWith(location.origin);
          out.push({ kind: external ? "broken-image-external" : "broken-image", message: `broken <img> ${src.slice(0, 160)}` });
        }
      }

      // Unlabeled interactive controls (no text, no aria-label, no title).
      const controls = Array.from(document.querySelectorAll("button, a[href], [role='button']"));
      for (const el of controls) {
        const h = el as HTMLElement;
        if (h.offsetParent === null) continue; // not visible
        const label =
          (h.innerText || "").trim() ||
          h.getAttribute("aria-label") ||
          h.getAttribute("title") ||
          h.querySelector("img[alt]")?.getAttribute("alt") ||
          (h.querySelector("svg") ? "icon" : "");
        if (!label) {
          out.push({ kind: "unlabeled-control", message: `unlabeled ${h.tagName.toLowerCase()} @ ${h.className || "(no class)"}` });
        }
      }

      // Leaked i18n keys: a known key appearing verbatim in visible text.
      const text = document.body?.innerText || "";
      const seen = new Set<string>();
      for (const k of keys as string[]) {
        if (seen.has(k)) continue;
        const re = new RegExp(`(^|[^a-z0-9_])${k}([^a-z0-9_]|$)`);
        if (re.test(text)) {
          seen.add(k);
          out.push({ kind: "untranslated-key", message: `i18n key leaked to UI: "${k}"` });
        }
      }
      return out;
    },
    { keys: I18N_KEYS },
  );

  return result.map((r) => {
    // External broken images are reported but never gate (content/headless flake).
    const kind = r.kind === "broken-image-external" ? "broken-image" : (r.kind as Finding["kind"]);
    const severity: Finding["severity"] =
      r.kind === "untranslated-key" || r.kind === "broken-image" ? "error" : "warning";
    return { kind, severity, area: "render", route, message: r.message, detail: r.detail };
  });
}
