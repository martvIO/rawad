"use strict";
// Express application factory for the Dawa REST API.
//
// Mounted as the `api` Cloud Function (see ../index.ts). All HTTP traffic
// from the frontend hits this app first. The app:
//   1. Trusts the GCP load balancer's proxy headers (X-Forwarded-For, etc.)
//      so per-IP rate limiting works correctly.
//   2. Applies CORS with an explicit allowlist from `ALLOWED_ORIGINS`.
//   3. Parses JSON bodies up to 10 MB (large enough for embedded photo
//      data URLs that the legacy code path used).
//   4. Mounts each resource router under its `/auth`, `/users`, etc. prefix.
//   5. Has a final JSON error handler so unhandled exceptions never crash
//      the function — every error becomes a `{ error: "..." }` response.
//
// What this file does NOT do:
//   - It does not call `initializeApp()`. That happens once in `../index.ts`
//     before any handler can run.
//   - It does not own per-route auth / rate-limiting logic. Those are
//     middlewares applied inside each router.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
exports.stripApiPrefix = stripApiPrefix;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = require("./routes/auth");
const settings_1 = require("./routes/settings");
const users_1 = require("./routes/users");
const guests_1 = require("./routes/guests");
const confirmations_1 = require("./routes/confirmations");
const liveLocations_1 = require("./routes/liveLocations");
const invites_1 = require("./routes/invites");
const assignments_1 = require("./routes/assignments");
const proofs_1 = require("./routes/proofs");
const digital_1 = require("./routes/digital");
// NOTE: additional routers (users, guests, ...) are mounted as their files
// are created in subsequent migration steps. The import + app.use lines
// below are added incrementally.
// ─── Constants ────────────────────────────────────────────────────────────────
/** Max JSON body size. 10 MB is enough for legacy data-URL photo payloads. */
const JSON_BODY_LIMIT = "10mb";
/** Env var listing allowed origins, comma-separated. */
const ALLOWED_ORIGINS_ENV = "ALLOWED_ORIGINS";
// ─── App construction ─────────────────────────────────────────────────────────
exports.app = (0, express_1.default)();
// Trust the single Google Front End proxy that fronts Cloud Functions so
// `req.ip` resolves to the actual client. Without this, X-Forwarded-For
// would be ignored and every IP-keyed rate-limit bucket would collapse to
// the proxy's address.
exports.app.set("trust proxy", true);
exports.app.use((0, cors_1.default)({
    origin: buildCorsOriginCheck(),
    credentials: false, // We use Bearer tokens, not cookies.
}));
exports.app.use(express_1.default.json({ limit: JSON_BODY_LIMIT }));
// Firebase Hosting rewrites preserve the full path, so a request to
// /api/auth/login arrives at this function with req.url = "/api/auth/login".
// Direct Cloud Functions URLs (https://.../api/auth/login) strip the function
// name and arrive as "/auth/login". Normalize both shapes by removing a
// leading "/api" so routers can be mounted at "/auth" once.
exports.app.use(stripApiPrefix);
// ─── Routers ──────────────────────────────────────────────────────────────────
exports.app.use("/auth", auth_1.authRouter);
exports.app.use("/settings", settings_1.settingsRouter);
exports.app.use("/users", users_1.usersRouter);
exports.app.use("/guests", guests_1.guestsRouter);
exports.app.use("/confirmations", confirmations_1.confirmationsRouter);
exports.app.use("/live-locations", liveLocations_1.liveLocationsRouter);
exports.app.use("/invites", invites_1.invitesRouter);
exports.app.use("/assignments", assignments_1.assignmentsRouter);
exports.app.use("/proofs", proofs_1.proofsRouter);
exports.app.use("/digital", digital_1.digitalRouter);
// ─── Health probe ─────────────────────────────────────────────────────────────
/**
 * Minimal health check. Useful for smoke-testing deploys (curl /api/health)
 * and for downstream uptime monitors. Returns the function's process uptime
 * so a flapping/restarting function is visible.
 */
exports.app.get("/health", (_req, res) => {
    res.json({ ok: true, uptimeSeconds: Math.floor(process.uptime()) });
});
// ─── 404 handler ──────────────────────────────────────────────────────────────
/**
 * Unknown route fallback. Without this, Express's default would emit an HTML
 * error page; we want a uniform JSON shape so the frontend's `apiClient.js`
 * can parse it the same way as any other error.
 */
exports.app.use((req, res) => {
    res.status(404).json({ error: "not_found", path: req.path });
});
// ─── Final error handler ──────────────────────────────────────────────────────
/**
 * Catch-all error handler. Express identifies this as an error handler by
 * its 4-arg signature. Any `throw` or `next(err)` inside a route lands here.
 * Logs the error to Cloud Functions stderr and returns a JSON 500 — never
 * leaks the stack trace to the client.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
exports.app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error("[api] Unhandled error:", err);
    if (res.headersSent)
        return; // Streaming endpoints (SSE) may have started.
    res.status(500).json({ error: "internal_error" });
});
// ─── /api prefix normalizer ──────────────────────────────────────────────────
/**
 * Strip a leading "/api" segment from req.url so resource routers can be
 * mounted at "/auth", "/users", etc. regardless of whether the request
 * arrived via Firebase Hosting rewrite (preserves "/api/...") or via a
 * direct Cloud Functions URL (strips the function name, so "/auth/...").
 *
 * Exported so the behavior is unit-testable without booting the full app.
 */
function stripApiPrefix(req, _res, next) {
    if (req.url === "/api")
        req.url = "/";
    else if (req.url.startsWith("/api/"))
        req.url = req.url.slice(4);
    next();
}
/**
 * Build the CORS origin-checker from the `ALLOWED_ORIGINS` env var.
 *
 * Behavior:
 *   - If `ALLOWED_ORIGINS` is unset or empty, all origins are allowed.
 *     This is intentional so local development (Vite on :5173, etc.) works
 *     without configuration; in production set the env var to the prod URL.
 *   - If set, only origins listed (comma-separated, exact match) are allowed.
 *     Server-to-server requests with no Origin header are always allowed.
 */
function buildCorsOriginCheck() {
    const raw = process.env[ALLOWED_ORIGINS_ENV] ?? "";
    const allowList = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (allowList.length === 0) {
        return true; // cors lib: allow any origin
    }
    return function originCheck(origin, cb) {
        if (!origin) {
            cb(null, true); // server-to-server, curl, mobile WebView
            return;
        }
        if (allowList.includes(origin)) {
            cb(null, true);
            return;
        }
        // Disallowed origin: do NOT throw (that turns into a 500 and takes the whole
        // API down for that browser). Instead deny CORS headers — the browser blocks
        // genuine cross-origin reads, while same-origin requests (the app calling its
        // own /api) still succeed because same-origin doesn't require CORS headers.
        // eslint-disable-next-line no-console
        console.warn(`[api] CORS: origin not in allowlist: ${origin}`);
        cb(null, false);
    };
}
//# sourceMappingURL=index.js.map