// Tiny, feature-detected haptic helper. navigator.vibrate is Android-only (iOS
// Safari ignores it — a silent no-op) and must never be called bare. We also
// respect prefers-reduced-motion, treating a buzz as motion the guest opted out
// of. Used for exactly two peak moments: the envelope seal-break and RSVP
// confirm — short single pulses only, never a repeating buzz.
export function haptic(pattern) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    if (typeof window !== "undefined" && window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(pattern);
  } catch { /* no-op */ }
}
