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
import { buildCorsOriginCheck } from "./cors";

import { authRouter } from "./routes/auth";
import { settingsRouter } from "./routes/settings";
import { usersRouter } from "./routes/users";
import { lifecycleRouter } from "./routes/lifecycle";
import { guestsRouter } from "./routes/guests";
import { confirmationsRouter } from "./routes/confirmations";
import { liveLocationsRouter } from "./routes/liveLocations";
import { invitesRouter } from "./routes/invites";
import { assignmentsRouter } from "./routes/assignments";
import { proofsRouter } from "./routes/proofs";
import { digitalRouter } from "./routes/digital";
import { photoFacesRouter } from "./routes/photoFaces";
import { adminRouter } from "./routes/admin";
import { whatsappRouter } from "./routes/whatsapp.routes";
import { paymentsRouter } from "./routes/payments";
import { decryptPasswordFields } from "./middleware/decryptPasswordFields";
import { isEncryptionAvailable } from "./passwordCrypto";
import { captureError, sentryEnabled } from "../sentry";
import { requestLog } from "./middleware/requestLog";
import { blockCheck } from "./middleware/blockCheck";
import { securityRouter } from "./routes/security";
// NOTE: additional routers (users, guests, ...) are mounted as their files
// are created in subsequent migration steps. The import + app.use lines
// below are added incrementally.

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max JSON body size. 10 MB is enough for legacy data-URL photo payloads. */
const JSON_BODY_LIMIT = "10mb";

// ─── App construction ─────────────────────────────────────────────────────────

export const app = express();

// Trust a FIXED number of proxy hops (the Google Front End / load balancer
// that fronts Cloud Functions), NOT `true`. This is security-critical:
//   - With `trust proxy: true`, Express derives `req.ip` from the LEFTMOST
//     X-Forwarded-For entry, which is fully client-controlled. An attacker
//     can then rotate that header to mint a fresh per-IP rate-limit bucket on
//     every request, defeating the limiter entirely (login/OTP/confirm/wish).
//   - With a numeric hop count, Express counts trusted proxies from the RIGHT
//     and ignores any attacker-prepended entries, so `req.ip` reflects the
//     address our infrastructure actually appended.
// Override via TRUSTED_PROXY_HOPS only if the deployment topology changes.
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS) || 1;
app.set("trust proxy", TRUSTED_PROXY_HOPS);

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

// Per-request access logging (Cloud Logging) + path-scan detection. Mounted
// before the routers so its res.on("finish") hook sees the final status of
// every request, including 404s.
app.use(requestLog);

// Block enforcement: refuse a blocked IP / device fingerprint on EVERY route
// (including public forms) before any handler runs. Account blocks are enforced
// separately by Firebase Auth (disable + token revoke) via requireAuth.
// Fail-open — a block-store error never locks everyone out.
app.use(blockCheck);

// ─── Routers ──────────────────────────────────────────────────────────────────

// decryptPasswordFields runs ahead of the two routers that receive passwords,
// turning any `enc:v1:` envelope back into plaintext in `req.body` before the
// handlers (and isStrongPassword / Firebase Auth) read it. Plaintext bodies
// pass through untouched (backward-compatible).
app.use("/auth", decryptPasswordFields, authRouter);
app.use("/settings", settingsRouter);
app.use("/users", decryptPasswordFields, usersRouter);
app.use("/lifecycle", lifecycleRouter);
app.use("/guests", guestsRouter);
app.use("/confirmations", confirmationsRouter);
app.use("/live-locations", liveLocationsRouter);
app.use("/invites", invitesRouter);
app.use("/assignments", assignmentsRouter);
app.use("/proofs", proofsRouter);
// Mounted BEFORE /digital so the digital router's ":uid" params can never
// capture the literal "photos" path segment.
app.use("/digital/photos", photoFacesRouter);
app.use("/digital", digitalRouter);
// Mount /admin/security BEFORE /admin so the more specific prefix matches first.
app.use("/admin/security", securityRouter);
app.use("/admin", adminRouter);
app.use("/whatsapp", whatsappRouter);
app.use("/payments", paymentsRouter);

// ─── Health probe ─────────────────────────────────────────────────────────────

/**
 * Minimal health check. Useful for smoke-testing deploys (curl /api/health)
 * and for downstream uptime monitors. Returns the function's process uptime
 * so a flapping/restarting function is visible.
 */
app.get("/health", (_req, res) => {
  // `encryption` surfaces whether the password-encryption layer has a usable key.
  // It is `false` when PASSWORD_ENC_PRIVATE_KEY is unset in production (the layer
  // silently falls back to plaintext-over-TLS) — so monitoring can alert when a
  // deploy forgot to provision the secret.
  res.json({
    ok: true,
    uptimeSeconds: Math.floor(process.uptime()),
    encryption: isEncryptionAvailable(),
    monitoring: sentryEnabled, // false until SENTRY_DSN is provisioned
  });
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
  captureError(err); // → Sentry when SENTRY_DSN is set; no-op otherwise.
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

// CORS origin policy (fail-closed; always-allowed set + ALLOWED_ORIGINS) lives in
// ./cors so the allow/deny decision is unit-testable — see api/cors.ts.
