// Optional frontend error monitoring (Sentry). Inert unless VITE_SENTRY_DSN is
// set at build time. The SDK is lazy-imported so it never weighs on the main
// bundle when monitoring is off (no DSN → the import branch never runs).
//
// PII care: this is a wedding product (guest names/phones, invite tokens in
// URLs). tracesSampleRate is 0 (errors only) and beforeSend redacts token query
// params; we do not attach request bodies.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0,
        environment: import.meta.env.MODE,
        sendDefaultPii: false,
        beforeSend(event) {
          // Redact ?token=… (invite/photo secrets) from any captured URL.
          if (event.request?.url) {
            event.request.url = event.request.url.replace(/token=[^&]+/g, "token=[redacted]");
          }
          return event;
        },
      });
    })
    .catch(() => {
      /* monitoring is best-effort — never break the app over it */
    });
}
