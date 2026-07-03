// Best-effort device fingerprint for the security / monitoring layer.
//
// IMPORTANT: this is NOT a hardware id and NOT a security control. It is an
// evadable, weak signal (a persisted random salt folded with a few stable
// browser/device traits) whose only job is to let the admin Security page
// correlate abuse from one device across changing IPs / VPNs. It resets when the
// user clears storage or switches browser/profile — treat it accordingly.
//
// DOM-free-safe: every global is guarded so this also runs in the Expo app.

import { load, save } from "./storage.js";

const FP_KEY = "dawa.deviceFp";

/** Generate `len` random hex chars, preferring a CSPRNG when available. */
function randomHex(len) {
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const cryptoObj =
    g.crypto && typeof g.crypto.getRandomValues === "function" ? g.crypto : null;
  if (cryptoObj) {
    const bytes = new Uint8Array(Math.ceil(len / 2));
    cryptoObj.getRandomValues(bytes);
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out.slice(0, len);
  }
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** Fast non-crypto hash (FNV-1a) → 8 hex chars. Collisions are harmless here. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Fold a few stable device traits into a string (best-effort, all guarded). */
function traitString() {
  const parts = [];
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav) {
      if (nav.userAgent) parts.push(nav.userAgent);
      if (nav.language) parts.push(nav.language);
      if (nav.platform) parts.push(nav.platform);
      if (typeof nav.hardwareConcurrency === "number") {
        parts.push(String(nav.hardwareConcurrency));
      }
    }
    const scr = typeof screen !== "undefined" ? screen : null;
    if (scr) parts.push(`${scr.width}x${scr.height}x${scr.colorDepth}`);
    const tz =
      typeof Intl !== "undefined" &&
      Intl.DateTimeFormat &&
      Intl.DateTimeFormat().resolvedOptions
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : null;
    if (tz) parts.push(tz);
  } catch {
    /* ignore — a partial or empty trait string is fine */
  }
  return parts.join("|");
}

let cached = null;

/**
 * Return a stable per-device/browser fingerprint: 32 lowercase hex chars
 * (matches the server's X-Device-FP validation). Persisted across sessions
 * until storage is cleared; memoised for the module lifetime so it stays stable
 * even when storage is unavailable.
 */
export function getDeviceFingerprint() {
  if (cached) return cached;
  let fp = load(FP_KEY, null);
  if (typeof fp !== "string" || !/^[a-f0-9]{16,64}$/.test(fp)) {
    fp = randomHex(24) + fnv1a(traitString()); // 24 + 8 = 32 hex
    save(FP_KEY, fp);
  }
  cached = fp;
  return fp;
}
