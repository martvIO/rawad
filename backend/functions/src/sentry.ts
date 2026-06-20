// Optional backend error monitoring (Sentry). Completely inert unless SENTRY_DSN
// is provisioned in the Functions environment — so deploying this is safe before
// a project/DSN exists (same dormant-until-configured pattern as WhatsApp/Stripe).
//
// We capture manually in the Express error handler rather than using
// setupExpressErrorHandler so we don't depend on import ordering inside the
// Cloud Functions bundle. tracesSampleRate is 0 (errors only, no perf spend),
// and beforeSend scrubs request data/headers that can carry PII (phones, names,
// auth tokens) before anything leaves the server.

import * as Sentry from "@sentry/node";

const DSN = process.env.SENTRY_DSN;

export const sentryEnabled = Boolean(DSN);

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0,
    environment: process.env.GCLOUD_PROJECT || "dawa",
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        // Strip ?token=… from the captured URL (invite/photo tokens are secrets).
        if (event.request.query_string) event.request.query_string = "[redacted]";
        if (typeof event.request.url === "string") {
          event.request.url = event.request.url.replace(/token=[^&]+/g, "token=[redacted]");
        }
      }
      return event;
    },
  });
}

/** Report a server error to Sentry when enabled; no-op otherwise. Never throws. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* monitoring must never break the request path */
  }
}
