// Conservative, time-boxed auto-blocking. A few high-confidence signals
// (repeated auth failures, sustained rate-limit breaches, path scanning) from a
// single IP trip a SHORT, automatic IP block that the admin can review and lift
// from the Security page.
//
// DESIGN CHOICES (from the security grilling):
//   - IP-only. We NEVER auto-block an account (too easy to lock out a real user
//     behind a shared NAT); account blocks are always a manual admin action.
//   - Time-boxed. Every auto-block has an `expiresAt`, so a false positive
//     self-heals without admin intervention.
//   - Best-effort in-memory counters, per warm instance. Under-counting across
//     instances is fine — we would rather miss a borderline case than
//     false-positive. The block itself is written to RTDB, so once tripped it
//     applies fleet-wide.

import type { Request } from "express";
import { clientIp, ipKey } from "./api/clientMeta";
import { setBlock } from "./blockList";
import { recordSecurityEvent } from "./securityEvents";

/** Signals that can accumulate toward an auto-block, with their thresholds. */
export type AutoBlockSignal = "auth_failure" | "rate_limited" | "path_scan";

interface Rule {
  /** Count within `windowMs` that trips the block. */
  threshold: number;
  windowMs: number;
  /** How long the resulting IP block lasts. */
  blockMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

const RULES: Record<AutoBlockSignal, Rule> = {
  // 20 failed logins from one IP in 15 min → 1h block.
  auth_failure: { threshold: 20, windowMs: 15 * MIN, blockMs: HOUR },
  // 10 rate-limit rejections from one IP in 10 min → 1h block.
  rate_limited: { threshold: 10, windowMs: 10 * MIN, blockMs: HOUR },
  // 20 unknown-route (404) hits from one IP in 1 min → 1h block.
  path_scan: { threshold: 20, windowMs: MIN, blockMs: HOUR },
};

interface Counter {
  count: number;
  resetAt: number;
}

/** key = `${signal}:${ipKey}` */
const counters = new Map<string, Counter>();

/** Disabled inside the emulator so e2e/load tests can't auto-block themselves. */
const IN_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

/**
 * Record one occurrence of `signal` for the request's IP. When the count
 * crosses the rule threshold within the window, write a short IP block and emit
 * an `auto_block` security event. Best-effort and non-throwing.
 */
export function recordAutoBlockSignal(signal: AutoBlockSignal, req: Request): void {
  if (IN_EMULATOR) return;
  const rule = RULES[signal];
  const key = `${signal}:${ipKey(clientIp(req))}`;
  const now = Date.now();

  const existing = counters.get(key);
  const counter =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + rule.windowMs };
  counter.count += 1;
  counters.set(key, counter);

  if (counter.count !== rule.threshold) return; // fire exactly once per window

  const rawIp = clientIp(req);
  const ip = ipKey(rawIp);
  const expiresAt = now + rule.blockMs;
  setBlock("ip", ip, {
    reason: `auto:${signal}`,
    by: "auto",
    ts: now,
    expiresAt,
    value: rawIp,
  })
    .then(() =>
      recordSecurityEvent("auto_block", req, {
        detail: { signal, threshold: rule.threshold, expiresAt },
      })
    )
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[autoBlock] failed to write block", err);
    });
}
