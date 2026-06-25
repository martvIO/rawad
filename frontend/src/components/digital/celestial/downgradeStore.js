// Session-scoped "this device proved too slow for the WebGL world" flag, shared
// by every surface that mounts the celestial engine (the invitation ambience and
// the landing hero) so a confirmed FPS downgrade isn't re-attempted on the next
// mount or route navigation. Scoped to the session (not localStorage) so a fresh
// visit re-probes — the slowness may have been a one-off (a busy device moment).
const KEY = "dawa-cel-downgrade";

export function celDowngraded() {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markCelDowngraded() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* sessionStorage unavailable (private mode quota) — degrade silently */
  }
}
