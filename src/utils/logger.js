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
export const logErr = (tag, e) => {
  if (!ON) return;
  const code = e?.code || e?.name || "";
  const msg  = e?.message || String(e);
  console.error("[dawa]", tag, code, msg, e);
};
