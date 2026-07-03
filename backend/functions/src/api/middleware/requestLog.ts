// Per-request access logging — the "monitor every API call" layer.
//
// Emits ONE structured line per request to Cloud Logging (stdout). Cloud
// Logging is the complete, cheap, auto-retained access log; the admin Security
// page reads only the threat SUBSET from Firestore (securityEvents.ts). This
// middleware also detects path-scanning (a burst of 404s from one IP) and feeds
// it to the security-event recorder + conservative auto-blocker.
//
// PRIVACY — logs the method, redacted path, status, latency, and network/caller
// identity ONLY. Never the request body, headers, passwords, tokens, or PII.

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { clientIp, ipKey } from "../clientMeta";
import { recordSecurityEvent, redactPath } from "../../securityEvents";
import { recordAutoBlockSignal } from "../../autoBlock";

/** A 404 burst from one IP within this window is treated as scanning. */
const SCAN_WINDOW_MS = 60_000;
/** 404 count at which we surface ONE path_scan event (auto-block trips higher). */
const SCAN_EVENT_THRESHOLD = 10;

interface ScanCounter {
  count: number;
  resetAt: number;
}
const scanCounters = new Map<string, ScanCounter>();

export function requestLog(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const caller = req.caller;

    // Structured access-log line (Cloud Logging parses JSON on stdout).
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        tag: "api_access",
        method: req.method,
        path: redactPath(req.path),
        status,
        ms,
        ip: clientIp(req),
        uid: caller?.uid ?? null,
        role: caller?.claims?.role ?? null,
      })
    );

    // Path-scan detection: count 404s per IP in a rolling window. Surface a
    // single event when the burst threshold is crossed (not on every 404, which
    // would flood Firestore), and feed the auto-blocker (which trips higher).
    if (status === 404) {
      const key = ipKey(clientIp(req));
      const now = Date.now();
      const existing = scanCounters.get(key);
      const counter =
        existing && existing.resetAt > now
          ? existing
          : { count: 0, resetAt: now + SCAN_WINDOW_MS };
      counter.count += 1;
      scanCounters.set(key, counter);

      if (counter.count === SCAN_EVENT_THRESHOLD) {
        recordSecurityEvent("path_scan", req, {
          detail: { count: counter.count, windowMs: SCAN_WINDOW_MS },
        });
      }
      recordAutoBlockSignal("path_scan", req);
    }
  });

  next();
}
