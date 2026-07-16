// Single source for the per-template live-demo URL. Every surface that links to
// a template's demo — the admin demo tab, the groom editor's template picker,
// the public gallery page, and the landing-page strip — builds its href here so
// the query scheme (?demo=1&template=…) lives in exactly one place.
//
// The demo route is /d/demo/demo (the "demo/demo" username/token pair is a
// placeholder; demo mode is switched on purely by ?demo=1 — see
// DigitalInvitationPage.jsx). `template` selects which template renders the
// shared published demo content; the remaining optional params mirror the demo
// overrides the invitation page already understands (theme/font/date/name).
import { DEFAULT_TEMPLATE_ID } from "@dawa/core/data/digitalTemplates.js";

const DEMO_BASE = "/d/demo/demo";

// Build a shareable demo link for `templateId`. `extra` may carry any of the
// demo overrides (theme, font, date, name); empty values are dropped so the URL
// stays clean. The classic template is linkable too (it just omits ?template
// for the shortest canonical URL, since classic is the default).
export function demoPreviewUrl(templateId, extra = {}) {
  const params = new URLSearchParams({ demo: "1" });
  if (templateId && templateId !== DEFAULT_TEMPLATE_ID) params.set("template", templateId);
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== "") params.set(k, String(v));
  }
  return `${DEMO_BASE}?${params.toString()}`;
}

// Absolute URL variant for copy-to-clipboard / sharing in sales chats. Falls
// back to the relative path when there is no window (SSR / tests).
export function demoPreviewShareUrl(templateId, extra = {}) {
  const rel = demoPreviewUrl(templateId, extra);
  if (typeof window === "undefined" || !window.location) return rel;
  return `${window.location.origin}${rel}`;
}
