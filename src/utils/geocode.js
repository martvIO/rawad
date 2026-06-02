// Geocode a free-text address (city / street) to {lat, lng}, to place guests on
// the driver map when they didn't share precise GPS. Approximate (street/area
// level). Each address is geocoded once and cached in localStorage (misses too).
//
// Uses Nominatim restricted to IL/PS (countrycodes) — for this region's Arabic
// city names that hard filter is accurate, whereas free-text providers return
// wrong-country matches (Egypt/Syria). We NEVER return an out-of-region pin.
// Self-throttled to <= 1 request/second per Nominatim's usage policy; network
// calls also have a hard timeout so a stalled request can't freeze the batch.

const CACHE_KEY = "dawa.geocodeCache.v2";
const MIN_GAP_MS = 1100;   // Nominatim policy: <= 1 req/sec
const FETCH_TIMEOUT_MS = 7000;

let memCache = null;
let lastReqAt = 0;

function loadCache() {
  if (memCache) return memCache;
  try { memCache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {}; }
  catch { memCache = {}; }
  return memCache;
}
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(memCache)); } catch { /* quota — ignore */ }
}
function norm(s) { return (s || "").toString().trim().replace(/\s+/g, " ").toLowerCase(); }

async function throttle() {
  const wait = Math.max(0, lastReqAt + MIN_GAP_MS - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
}

async function nominatim(query) {
  await throttle();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=il,ps&limit=1"
      + `&q=${encodeURIComponent(query)}`,
      { signal: ac.signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const d = Array.isArray(data) ? data[0] : null;
    const lat = d ? parseFloat(d.lat) : NaN;
    const lng = d ? parseFloat(d.lon) : NaN;
    return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeOne(query) {
  const k = norm(query);
  if (!k) return null;
  const cache = loadCache();
  if (Object.prototype.hasOwnProperty.call(cache, k)) return cache[k]; // may be null (known miss)
  const result = await nominatim(query);
  cache[k] = result;
  saveCache();
  return result;
}

/**
 * Geocode `query`; if it can't be resolved and `fallbackQuery` (e.g. just the
 * city) is given, try that. Returns {lat,lng} (in IL/PS) or null.
 */
export async function geocodeAddress(query, fallbackQuery) {
  const primary = await geocodeOne(query);
  if (primary) return primary;
  if (fallbackQuery && norm(fallbackQuery) && norm(fallbackQuery) !== norm(query)) {
    return geocodeOne(fallbackQuery);
  }
  return null;
}
