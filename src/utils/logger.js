// Tagged console wrapper. One grep target ("[dawa]") and one place to later
// swap in Sentry/etc. Silent in production unless VITE_DEBUG=1 is set.
const ON = import.meta.env.DEV || import.meta.env.VITE_DEBUG === "1";

export const log = (...a) => {
  if (ON) console.log("[dawa]", ...a);
};

export const logWarn = (...a) => {
  if (ON) console.warn("[dawa]", ...a);
};

// Use this in every catch block. `tag` is a short label (e.g. "addUser",
// "callable(createPortalUser)"); `e` is the caught error.
//
// Errors ALWAYS print, regardless of the DEV/VITE_DEBUG gate — silencing
// errors in production defeats the purpose of logging. Verbose info/warn
// stays gated by ON so we don't spam users' consoles with normal traffic.
export const logErr = (tag, e) => {
  const code = e?.code || e?.name || "";
  const msg  = e?.message || String(e);
  console.error("[dawa]", tag, code, msg, e);
};
