// Localizes the error codes thrown by apiClient.js into user-facing strings.
//
// apiClient throws:
//   - ApiError(message "api_<serverError>" | "api_<status>", body {error}, status)
//   - Error("network_error") / Error("request_timeout")
//   - ApiError(401, null, "session_expired")
//
// Without this, callers did `showToast(e?.message || fallback)` — but e.message
// IS the raw code (a truthy string), so the localized fallback never ran and the
// user saw "api_429" / "network_error" verbatim. Route every catch through here.
//
// Usage:
//   showToast(localizeApiError(err, t))                  // hooks/pages with t()
//   showToast(localizeApiError(err, lang, fallbackStr))  // pages using tt(lang,…)
//
// `fallback` (optional) is shown for UNRECOGNIZED codes instead of the generic
// message, so existing context-specific copy ("upload failed") is preserved while
// known transport/domain errors still get a friendly localized message.
import { makeT } from "../i18n/index.js";

// Known transport + domain error codes → i18n key.
const CODE_KEYS = {
  network_error:       "err_network",
  request_timeout:     "err_timeout",
  session_expired:     "err_session_expired",
  too_many_requests:   "err_too_many",
  rate_limited:        "err_too_many",
  design_not_approved: "err_design_not_approved",
  cannot_self_delete:  "err_cannot_self_delete",
  cannot_self_demote:  "err_cannot_self_delete",
  duplicate_phone:     "err_duplicate_phone",
  phone_taken:         "err_duplicate_phone",
  unknown_groom:       "err_unknown_groom",
  token_expired:       "err_token_expired",
  expired:             "err_token_expired",
  used:                "err_token_used",
};

function resolveT(tOrLang) {
  return typeof tOrLang === "function" ? tOrLang : makeT(tOrLang || "ar");
}

// Pull a normalized error code out of whatever apiClient threw.
export function apiErrorCode(err) {
  if (!err) return "";
  const bodyCode = err?.body?.error;
  if (typeof bodyCode === "string" && bodyCode) return bodyCode;
  const msg = typeof err === "string" ? err : (err?.message || "");
  return msg.startsWith("api_") ? msg.slice(4) : msg;
}

export function localizeApiError(err, tOrLang, fallback) {
  const t = resolveT(tOrLang);
  const code = apiErrorCode(err);
  const mapped = CODE_KEYS[code];
  if (mapped) return t(mapped);

  // Numeric HTTP status (e.g. "429", "500") embedded in the code or on the error.
  const numeric = /^\d+$/.test(code) ? Number(code) : (err?.status || 0);
  if (numeric === 429) return t("err_too_many");
  if (numeric === 401 || numeric === 403) return t("err_session_expired");
  if (numeric >= 500) return t("err_server");

  // Unrecognized: keep the caller's context-specific message when provided.
  if (typeof fallback === "string" && fallback) return fallback;
  return t("err_generic");
}
