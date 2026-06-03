// Centralized frontend configuration.
//
// Every environment-driven value and every constant that was previously
// duplicated across two or more files lives here. Service files, hooks,
// components, and utilities import from this module instead of defining
// their own local copies.
//
// Conventions:
//   - Environment variables are read via `import.meta.env` with safe
//     fallbacks so the app still boots when a var is missing.
//   - Time durations are expressed in milliseconds and named *_MS.
//   - Sibling-related constants are grouped into a single object literal
//     so consumers can `import { POLL_MS } from "../config"` once.

// ─── Environment-driven values ───────────────────────────────────────────────

/**
 * Base URL of the REST API. Configured at build time via the Vite env var
 * `VITE_API_BASE_URL` (e.g. `https://us-central1-dawa-aa793.cloudfunctions.net/api`).
 * Falls back to same-origin `/api` for Firebase Hosting deployments where
 * the `/api/**` rewrite is in place. Trailing slash is stripped so callers
 * can safely append paths.
 */
export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

/**
 * Base URL for the live-location SSE stream ONLY. Firebase Hosting buffers
 * streamed responses, so an EventSource to the same-origin `/api/.../stream`
 * rewrite never connects. We hit the api function's direct Cloud Run URL
 * instead (allowed by the CSP `connect-src` + the function's CORS). Regular
 * JSON requests keep using same-origin `/api`. Override via `VITE_SSE_BASE_URL`.
 */
export const SSE_BASE_URL =
  (import.meta.env?.VITE_SSE_BASE_URL ?? "https://api-je74slt7ra-uc.a.run.app").replace(/\/$/, "");

/**
 * Base URL used when constructing per-guest invite links (e.g. for WhatsApp
 * "send invite" messages). Defaults to the production invite domain; dev
 * envs can override via VITE_INVITE_BASE_URL (e.g. point to localhost).
 */
export const INVITE_BASE_URL =
  import.meta.env?.VITE_INVITE_BASE_URL ?? "https://invite.dawa.to";

/**
 * Site key for the Phone-Auth invisible reCAPTCHA challenge. Only required
 * when the password-reset flow is exercised.
 */
export const RECAPTCHA_SITE_KEY = import.meta.env?.VITE_RECAPTCHA_V2_SITE_KEY ?? "";

// ─── Polling intervals ───────────────────────────────────────────────────────

/**
 * Per-resource poll intervals for the REST-based subscription layer.
 * The legacy Firebase `onValue` cadence was effectively "real-time"; for the
 * REST replacement we accept a small lag in exchange for HTTP simplicity.
 */
export const POLL_MS = {
  /** Default for list endpoints when a resource-specific value isn't set. */
  DEFAULT: 15 * 1000,
  /** /auth/me — refresh role / claims. */
  ME: 30 * 1000,
  GUESTS: 15 * 1000,
  CONFIRMATIONS: 15 * 1000,
  DIGITAL: 15 * 1000,
  SETTINGS: 30 * 1000,
  ASSIGNMENTS: 30 * 1000,
  /** Invite pages need to notice "used" within a few seconds. */
  INVITES: 3 * 1000,
};

// ─── UI timing constants ─────────────────────────────────────────────────────

export const TIMING = {
  /** How long a top-of-screen toast stays visible. */
  TOAST_MS: 3200,
  /** Stagger between WhatsApp tab-opens when bulk-sending invites. */
  WA_STAGGER_MS: 300,
};

// ─── Geolocation constants ───────────────────────────────────────────────────

export const GEO = {
  /** Drivers whose last fix is older than this are treated as offline. */
  STALE_MS: 30 * 1000,
  /** `maximumAge` passed to navigator.geolocation.watchPosition. */
  MAX_AGE_MS: 1000,
  /** `timeout` passed to navigator.geolocation.watchPosition. */
  TIMEOUT_MS: 12000,
  /** Republish cadence for the driver's GPS fix. */
  PUBLISH_INTERVAL_MS: 1000,
};

// ─── Token manager (localStorage-backed Firebase token lifecycle) ────────────

export const TOKEN_MGR = {
  /** Refresh proactively this many ms before recorded expiry. */
  REFRESH_LEAD_MS: 5 * 60 * 1000,
  /** Guard against negative setTimeout values. */
  MIN_REFRESH_DELAY_MS: 1000,
  /** Default ID-token lifetime when the server doesn't return expiresIn. */
  DEFAULT_EXPIRES_IN_SECONDS: 3600,
};

// ─── REST client timeouts ────────────────────────────────────────────────────
//
// Without these, a stalled network or a Cloud Functions cold-start that never
// resolves leaves spinners spinning forever (Cloud Functions can take up to
// 60s to cold-start). The frontend caps every request so a hang surfaces as
// a regular error and the user can retry.
export const API_TIMEOUT_MS = {
  /** JSON GET/POST/PATCH/PUT/DELETE — covers login, /auth/me, lists, mutations. */
  DEFAULT: 30 * 1000,
  /** Multipart upload — longer because large files legitimately take time. */
  UPLOAD: 2 * 60 * 1000,
};

// ─── Confirmation-match fuzzy thresholds ─────────────────────────────────────

export const MATCHING = {
  /** Minimum Dice-coefficient name similarity for a green match. */
  NAME_THRESHOLD: 0.55,
  /** Minimum Jaccard address similarity for a green match. */
  ADDRESS_THRESHOLD: 0.40,
};

// ─── External CDN URLs (Leaflet) ─────────────────────────────────────────────

export const LEAFLET = {
  VERSION: "1.9.4",
  CSS_URL: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  JS_URL: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
};

// ─── Map tile providers (Leaflet TileLayers) ─────────────────────────────────

export const MAP_TILES = {
  OSM: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  },
  ARCGIS_IMAGERY: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  },
  CARTO_LIGHT: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 19,
  },
  CARTO_DARK: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 19,
  },
};

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * Joiner used between address components (city / street / house) when
 * collapsing them into a single line. The Arabic comma + space matches the
 * formatting used everywhere from the original App.jsx.
 */
export const ADDRESS_JOINER = "، ";
