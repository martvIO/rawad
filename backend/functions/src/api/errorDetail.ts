// Shared best-effort error-to-string helper for JSON error responses.
//
// Public/admin 5xx responses must never echo raw error text in production — it
// can leak Firestore paths / GCS bucket names / internal IDs. Detail is
// SUPPRESSED BY DEFAULT and only surfaced when DAWA_DEBUG_ERRORS=1 (e.g. via
// functions/.env.local) for local debugging. Cloud Logging still receives the
// full error via the route's own console.error.
//
// This consolidates a dozen identical per-route copies into one source of truth.
// `safeDetail` is an alias kept so call sites that referenced it read clearly.

export function errorMessage(err: unknown): string | undefined {
  if (process.env.DAWA_DEBUG_ERRORS !== "1") return undefined;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}

/** Alias of {@link errorMessage} — same suppress-by-default semantics. */
export const safeDetail = errorMessage;
