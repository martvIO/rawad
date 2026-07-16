// Whether this engine renders background-clip:text (the gold "foil" gradient on
// names / titles) correctly. A few legacy in-app engines report support but paint
// the clipped text as a solid block — the browsers some guests open the WhatsApp
// link in — so we enable the gradient only when supported AND the engine isn't a
// known-bad legacy one, and fall back to a flat solid color otherwise. Conservative
// by design: anything uncertain gets the safe flat path. Shared by every template
// (classic .dawa-inv and Destination Love .tpl-dl) so the denylist lives in one place.
export function supportsGradientText() {
  if (typeof window === "undefined" || typeof CSS === "undefined" || !CSS.supports) return false;
  if (!(CSS.supports("-webkit-background-clip", "text") || CSS.supports("background-clip", "text"))) return false;
  const ua = navigator.userAgent || "";
  const sam = ua.match(/SamsungBrowser\/(\d+)/); // old Samsung Internet mis-renders clip-text
  if (sam && Number(sam[1]) < 12) return false;
  const andr = ua.match(/Android (\d+)/); // legacy Android WebView (pre Chromium auto-update)
  if (andr && Number(andr[1]) <= 6) return false;
  return true;
}
