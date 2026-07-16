// Guest-experience timing recorder for the public invitation page.
//
// Answers three owner questions the product could not previously answer:
//   1. How long did the invitation take to load?  → sealedMs (the sealed screen
//      is visible) and readyMs (everything, including the lazy 3D scene), plus
//      the standard web-vitals (TTFB / LCP / CLS / INP) for a comparable baseline.
//   2. How long until the guest opened it?        → tapDelayMs, measured from
//      "sealed visible" to the tap. `tapKind` separates a REAL tap from the
//      classic template's 5s auto-open, a skip, or the stuck-screen failsafe —
//      counting an auto-open as a "tap" would make the ritual look effortless
//      exactly where it is failing.
//   3. Did they complete the RSVP?                → derived server-side from the
//      existing viewedAt/confirmedAt stamps; nothing to measure here.
//
// HARD RULE: this module is invisible to the guest. Everything is wrapped in
// try/catch, nothing is awaited on the render path, and every send is
// fire-and-forget. A metrics failure must never cost a single frame of the
// sealed intro — that intro is the product's sales weapon.
//
// PRIVACY: the payload carries no guest PII. The token is the same credential
// the existing /invites/digital/opened ping already sends, and it is the only
// identifier here; names/phones never leave via this path.
//
// Transport is two-phase because the vitals finalize at different times:
//   phase "load"  — sent once the page is ready (or after a timeout): the timings
//                   we already know (sealed/ready/TTFB), plus tap fields if the
//                   guest was quick.
//   phase "final" — sent once on the first pagehide/visibility-hidden: LCP, CLS
//                   and INP only settle then. Uses fetch(keepalive) with a
//                   sendBeacon fallback, because a normal request is cancelled
//                   when the page unloads (this is also why apiClient — with its
//                   abort/timeout wrapper — is deliberately not used here).
// The two phases share a random loadId so the server can stitch one visit
// together without a session cookie.
import { API_BASE_URL } from "../config/index.js";

const PATH = "/invites/digital/metrics";
// If a page never signals "ready" (e.g. an effect throws, a template forgets to
// wire onReady), still report what we have rather than losing the visit.
const LOAD_SEND_TIMEOUT_MS = 15000;

const now = () => {
  try {
    return performance.now();
  } catch {
    return 0;
  }
};

const rnd = () => Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);

// TTFB straight off the navigation entry (no library needed, available early).
function readTtfb() {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    const v = nav?.responseStart;
    return typeof v === "number" && v >= 0 ? Math.round(v) : undefined;
  } catch {
    return undefined;
  }
}

// Fire-and-forget POST that survives page unload.
function send(body) {
  const url = `${API_BASE_URL}${PATH}`;
  const json = JSON.stringify(body);
  try {
    if (typeof fetch === "function") {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: true,
        credentials: "omit",
        mode: "cors",
      }).catch(() => {});
      return;
    }
  } catch {
    /* fall through to beacon */
  }
  try {
    navigator.sendBeacon?.(url, new Blob([json], { type: "application/json" }));
  } catch {
    /* metrics are best-effort by design */
  }
}

/**
 * Create a recorder for one page visit.
 *
 * @param {object}  o
 * @param {string}  o.token       invite token ("guest"), or a synthetic demo token
 * @param {string}  o.surface     "guest" | "demo" | "gallery"
 * @param {string}  o.templateId  which template rendered this visit
 * @param {string}  [o.lang]
 * @returns {{ handleIntroEvent: Function, dispose: Function }}
 */
export function createInviteMetrics({ token, surface, templateId, lang }) {
  const loadId = rnd();
  const t = { ttfbMs: readTtfb() };
  let sealedAt = null; // performance.now() when the sealed screen became visible
  let loadSent = false;
  let finalSent = false;
  let loadTimer = null;
  let disposed = false;

  const base = () => ({
    token: token || undefined,
    surface,
    templateId,
    loadId,
    lang: lang || undefined,
  });

  const sendLoad = () => {
    if (loadSent || disposed) return;
    loadSent = true;
    clearTimeout(loadTimer);
    send({ ...base(), phase: "load", t: { ...t } });
  };

  // LCP/CLS/INP only settle at page-hide, so they ride the "final" phase along
  // with any tap that happened after the load phase was already sent.
  const sendFinal = () => {
    if (finalSent || disposed) return;
    finalSent = true;
    sendLoad(); // guarantee the load phase was sent for a very short visit
    send({ ...base(), phase: "final", t: { ...t } });
  };

  // web-vitals is loaded lazily so it never sits on the invitation's critical
  // path; if the chunk fails we simply report without the vitals.
  import("web-vitals")
    .then(({ onLCP, onCLS, onINP }) => {
      if (disposed) return;
      onLCP((m) => { t.lcpMs = Math.round(m.value); });
      onCLS((m) => { t.cls = Math.round(m.value * 1000) / 1000; });
      onINP((m) => { t.inpMs = Math.round(m.value); });
    })
    .catch(() => {});

  const onHide = () => {
    if (document.visibilityState === "hidden") sendFinal();
  };
  const onPageHide = () => sendFinal();

  try {
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
  } catch {
    /* non-browser env (tests) */
  }

  /**
   * The single entry point the templates call.
   *   "sealed" — the sealed screen (guest name + tap cue) is visible
   *   "ready"  — everything is loaded, incl. the lazy 3D scene
   *   "open"   — the intro started opening; opts.kind = tap|auto|skip|failsafe|seen
   */
  const handleIntroEvent = (event, opts = {}) => {
    try {
      if (disposed) return;
      if (event === "sealed") {
        if (sealedAt == null) {
          sealedAt = now();
          t.sealedMs = Math.round(sealedAt);
        }
        return;
      }
      if (event === "ready") {
        if (t.readyMs == null) t.readyMs = Math.round(now());
        // Ready is the natural moment to report the load phase.
        sendLoad();
        return;
      }
      if (event === "open") {
        if (t.tapKind == null) {
          t.tapKind = opts.kind || "tap";
          // Delay is only meaningful relative to a visible sealed screen.
          if (sealedAt != null) t.tapDelayMs = Math.max(0, Math.round(now() - sealedAt));
        }
      }
    } catch {
      /* never surface a metrics error to the guest */
    }
  };

  // Safety net: report even if "ready" never arrives.
  try {
    loadTimer = setTimeout(sendLoad, LOAD_SEND_TIMEOUT_MS);
  } catch {
    /* ignore */
  }

  const dispose = () => {
    // Flush what we have (an SPA navigation away is still the end of this visit).
    try {
      sendFinal();
    } catch {
      /* ignore */
    }
    disposed = true;
    clearTimeout(loadTimer);
    try {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    } catch {
      /* ignore */
    }
  };

  return { handleIntroEvent, dispose };
}
