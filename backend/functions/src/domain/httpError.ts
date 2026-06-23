// Shared domain-error → HTTP mapping for the REST layer.
//
// Domain modules (domain/<resource>/*) throw a `DomainError` carrying a stable
// `code` string — the SAME tokens the route handlers historically emitted
// (`username_taken`, `phone_taken`, `not_found`, …). A `DomainError` NEVER
// carries an HTTP status: status lives at the seam, not in the domain. Each
// route owns a small `{ code → status }` table and a per-operation `fallback`
// slug for unexpected (non-domain) failures, so response bodies stay identical
// to the pre-extraction handlers.
//
//   try { res.json(await store.createUser(body, callerUid)); }
//   catch (err) { sendDomainError(res, err, USER_STATUS, "create_failed"); }

import { Response } from "express";
import { errorMessage } from "../api/errorDetail";

/**
 * A typed, HTTP-agnostic failure raised by a domain module. `extra` is merged
 * into the JSON body alongside `error: code` for the rare error that carries
 * additional context (e.g. `{ error: "too_many_designs", max: 5 }`).
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "DomainError";
  }
}

/**
 * Map a caught error to an HTTP response.
 *   - A `DomainError` whose `code` is in `statusByCode` → that status, body
 *     `{ error: code, ...extra }`. (No `detail` — these are expected outcomes.)
 *   - Anything else (infra/SDK failure, or an unmapped code) → 500 with body
 *     `{ error: fallback, detail }`, where `detail` is suppressed-by-default
 *     via `errorMessage` (only surfaced when DAWA_DEBUG_ERRORS=1).
 */
export function sendDomainError(
  res: Response,
  err: unknown,
  statusByCode: Record<string, number>,
  fallback: string,
): void {
  const status =
    err instanceof DomainError ? statusByCode[err.code] : undefined;
  if (err instanceof DomainError && status !== undefined) {
    res.status(status).json({ error: err.code, ...(err.extra ?? {}) });
    return;
  }
  res.status(500).json({ error: fallback, detail: errorMessage(err) });
}
