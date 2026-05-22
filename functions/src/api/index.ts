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

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

import { authRouter } from "./routes/auth";
import { settingsRouter } from "./routes/settings";
import { usersRouter } from "./routes/users";
import { guestsRouter } from "./routes/guests";
import { confirmationsRouter } from "./routes/confirmations";
import { liveLocationsRouter } from "./routes/liveLocations";
import { invitesRouter } from "./routes/invites";
import { assignmentsRouter } from "./routes/assignments";
import { proofsRouter } from "./routes/proofs";
import { digitalRouter } from "./routes/digital";
// NOTE: additional routers (users, guests, ...) are mounted as their files
// are created in subsequent migration steps. The import + app.use lines
// below are added incrementally.

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max JSON body size. 10 MB is enough for legacy data-URL photo payloads. */
const JSON_BODY_LIMIT = "10mb";

/** Env var listing allowed origins, comma-separated. */
const ALLOWED_ORIGINS_ENV = "ALLOWED_ORIGINS";

// ─── App construction ─────────────────────────────────────────────────────────

export const app = express();

// Trust the single Google Front End proxy that fronts Cloud Functions so
// `req.ip` resolves to the actual client. Without this, X-Forwarded-For
// would be ignored and every IP-keyed rate-limit bucket would collapse to
// the proxy's address.
app.set("trust proxy", true);

app.use(cors({
  origin: buildCorsOriginCheck(),
  credentials: false, // We use Bearer tokens, not cookies.
}));

app.use(express.json({ limit: JSON_BODY_LIMIT }));

// Firebase Hosting rewrites preserve the full path, so a request to
// /api/auth/login arrives at this function with req.url = "/api/auth/login".
// Direct Cloud Functions URLs (https://.../api/auth/login) strip the function
// name and arrive as "/auth/login". Normalize both shapes by removing a
// leading "/api" so routers can be mounted at "/auth" once.
app.use(stripApiPrefix);

// ─── Routers ──────────────────────────────────────────────────────────────────

app.use("/auth", authRouter);
app.use("/settings", settingsRouter);
app.use("/users", usersRouter);
app.use("/guests", guestsRouter);
app.use("/confirmations", confirmationsRouter);
app.use("/live-locations", liveLocationsRouter);
app.use("/invites", invitesRouter);
app.use("/assignments", assignmentsRouter);
app.use("/proofs", proofsRouter);
app.use("/digital", digitalRouter);

// ─── Health probe ─────────────────────────────────────────────────────────────

/**
 * Minimal health check. Useful for smoke-testing deploys (curl /api/health)
 * and for downstream uptime monitors. Returns the function's process uptime
 * so a flapping/restarting function is visible.
 */
app.get("/health", (_req, res) => {
  res.json({ ok: true, uptimeSeconds: Math.floor(process.uptime()) });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────

/**
 * Unknown route fallback. Without this, Express's default would emit an HTML
 * error page; we want a uniform JSON shape so the frontend's `apiClient.js`
 * can parse it the same way as any other error.
 */
app.use((req: Request, res: Response) => {
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
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("[api] Unhandled error:", err);
  if (res.headersSent) return; // Streaming endpoints (SSE) may have started.
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
export function stripApiPrefix(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.url === "/api") req.url = "/";
  else if (req.url.startsWith("/api/")) req.url = req.url.slice(4);
  next();
}

// ─── CORS helper ──────────────────────────────────────────────────────────────

type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

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

  return function originCheck(
    origin: string | undefined,
    cb: CorsOriginCallback
  ): void {
    if (!origin) {
      cb(null, true); // server-to-server, curl, mobile WebView
      return;
    }
    if (allowList.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error(`origin_not_allowed:${origin}`));
  };
}
