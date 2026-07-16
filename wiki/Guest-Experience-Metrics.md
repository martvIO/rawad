---
date: 2026-07-16
tags: [analytics, metrics, digital, guest, concept]
---

# Guest Experience Metrics

First-party measurement of what a guest actually experiences when they open a
digital invitation: **how long it took to load, how long until they opened it,
and whether they completed the "هل ستحضر؟" (RSVP) form**. Shipped 2026-07-16.

This is the execution of owner decision #3 from the live interview in
[[UX Research Discovery 2026-07-02]] — *"close the guest blind spot with funnel
metrics + observation"* — and it closes the **invite-open gap** that
[[Conversion KPIs]] flagged as blocking the RSVP funnel. It also supplies the
data the Wave 1 gate in [[Usability Templates Test Plan]] needs.

## What is measured

| Question | Metric | Source |
|---|---|---|
| Time to load | `sealedMs` (sealed screen visible), `readyMs` (fully loaded incl. lazy 3D) | client recorder |
| Standard perf | TTFB / LCP / CLS / INP | `web-vitals` (lazy chunk) |
| Time to open — reach | send → first visit lag | `viewedAt − inviteLinkSentAt` (**derived; no new tracking**) |
| Time to open — ritual | `tapDelayMs` (sealed visible → tap) + `tapKind` | client recorder |
| RSVP completed | any submission (attending **or** absent) | `confirmedAt` |
| Drop-off | opened-but-never-answered, never-opened | derived from existing stamps |

**`tapKind` is the honesty field:** `tap` (a real guest tap) vs `auto` (classic's
5s auto-open) vs `skip` / `failsafe` / `seen` (return visit). Only `tap` feeds the
tap-delay stat — counting an auto-open as a tap would make the ritual look
effortless exactly where it is failing. A high `autoOpenPct` means the tap cue is
not landing (the P2 "Im Khaled" floor risk).

## Architecture

| Piece | Path |
|---|---|
| Client recorder | `frontend/src/utils/inviteMetrics.js` |
| Bespoke hook (all templates) | `useIntroPhase` `onEvent` — `templates/introContract.js` |
| Classic hook | `sections/CelestialAmbience.jsx` (`onIntroEvent`) |
| Endpoint | `POST /invites/digital/metrics` — `api/routes/invites.ts` |
| Pure rollup helpers | `api/analytics/metricsRollup.ts` |
| Aggregation | `composeDigitalEngagement` / `composeTemplateMetrics` / `composeWeddingEngagement` / `composeDemoEngagement` in `api/analytics/aggregate.ts` |
| Admin UI | `pages/portal/admin/AdminEngagementSections.jsx` (mounted in `AdminAnalytics.jsx`) |

- **Instrumented at the CONTRACT, not per template** — `useIntroPhase` emits the
  sealed/open signals, so every bespoke template (present and future) reports
  identically and none can forget to. See [[Digital Invitations]].
- **Never blocks the guest** — every emit is latched + try/catch'd, `web-vitals`
  is a lazy chunk, and sends are fire-and-forget `fetch(keepalive)` with a
  `sendBeacon` fallback (apiClient's abort/timeout wrapper is unusable at
  pagehide). Endpoint failures return `200 {ok:false}` like `/digital/opened`.
- **Two-phase transport with per-field ownership** — `load` owns
  sealed/ready/ttfb; `final` (at pagehide) owns lcp/cls/inp; tap rides whichever
  phase first knows it, latched. **The server enforces the same split**, so a
  buggy/replayed client can't double-count. Both phases share a random `loadId`.

### Storage — rollups, deliberately not raw events
`metricsDaily/{surface}_{templateId}_{YYYYMMDD}` — one bounded doc per
(surface × template × day) holding **histogram buckets** (`hist.sealed.b0…b8`),
sums/counts, `tapKinds`, and CLS bands, written as one atomic
`set(merge:true)` of `FieldValue.increment`s (increments commute → no
transaction).

**Why:** every load reports, so a raw per-load collection would grow without
bound — and `/admin/analytics` reads its whole working set once per window. A
boundless events collection would turn that endpoint into a full-table scan and
eventually take the dashboard down. Rollups keep the read a bounded
`day >= …` range query (single-field → auto-indexed). Real guests additionally
get a **first-visit `perf` row** on their guest doc (mirrors `viewedAt`
semantics) for the drill-down table.

### Demo/prospect traffic is quarantined
Surfaces are `guest` | `demo` | `gallery`. Demo + gallery roll up under their own
doc ids, never touch a guest doc, and are reported ONLY in `demoEngagement` —
prospect browsing must never move a couple's numbers. Enforced in
`composeTemplateMetrics` (guest-surface filter) and pinned by tests.

## Honesty constraints (do not "fix" these into friendlier numbers)
- Percentiles come from histograms → they are bucket **upper edges** ("p90 ≤ 4s").
  A percentile landing in the open-ended tail reports the **last edge as a lower
  bound** (read: "≥30s"); **`null` means "no samples" and nothing else**, rendered
  "—". Do not conflate the two — see review finding 3 below for what breaks.
- The load headline shows the **worst** p90 across templates, not an average.
- Rollup days are **UTC** (Cloud Functions run UTC; keys must agree between
  concurrent writers) → daily charts shift 2–3h vs Israel local.
- `neverOpened` counts only guests actually sent a link.

## Two ordering bugs found by browser verification (not by unit tests)
Both silently dropped `sealedMs` — one of the two headline metrics:
1. **`ready` fires BEFORE `sealed`** (sibling subtrees → mount effects run in tree
   order; ~11ms apart on destination-love). The recorder sent the load phase
   synchronously on `ready`, i.e. always before `sealed` existed. Fix: the load
   phase **settles 250ms** before sending (`LOAD_SETTLE_MS`); pagehide still
   flushes immediately. Classic is sealed→ready, bespoke ready→sealed — both work.
2. **Child effects run before parent effects**, so the template emitted `sealed`
   while the page's recorder ref was still a no-op placeholder. Fix: the page
   **buffers pre-wiring events and replays them with their ORIGINAL timestamp**
   (`opts.at`) — replaying without it would stamp the sealed screen at replay time.

**Verified live** (Playwright MCP, both templates): classic `sealed@380 ready@511
auto-open@5513` → `tapKind:"auto"`, `tapDelayMs:5133`; destination-love
`sealed@631 ready@619 tap@1322` → `tapKind:"tap"`, `tapDelayMs:691`. No metric
appears in both phases.

## Four more bugs found by adversarial review (after the browser pass)
1. **Every demo metric was rejected with 400 — the demo feature recorded nothing.**
   The demo page's synthetic token (`demo-0ae918a0`) is an intro-replay
   cache-buster, not a credential, and fails the endpoint's `TOKEN_HEX_RE`
   (32-hex) check → the *whole* report was rejected. The browser pass missed it
   because the endpoint isn't deployed yet, so the 400 was indistinguishable from
   the expected 404. **Rule: only the `guest` surface ever sends a token** —
   enforced inside the recorder (`base()`), not at the call site, so no future
   surface can reintroduce it. Pinned on both sides (client omits; server rejects).
2. **The `gallery` surface had no sender.** Backend support, allowlist branch and
   an admin KPI all existed, but nothing reported it → the admin read a
   measured-looking **0**, i.e. a fabricated metric. `TemplateGalleryPage` now
   reports its visit (`surface:"gallery"`, `templateId:"all"`).
3. **The load headline inverted on the worst case.** `histPercentile` returned
   `null` for BOTH "no samples" and "slower than 30s", and the UI's
   worst-across-templates skips nulls — so the >30s loading wall vanished and a
   *fast* template was reported as worst. **`null` now means "no samples" and
   nothing else**; the open-ended tail reports the last edge as a lower bound
   (≥30s) — measured, not invented.
4. **`composeDemoEngagement` re-expanded rollups per load** (one array entry per
   load), rebuilding the unbounded per-event list the rollups exist to avoid,
   inside the analytics request. Now buckets day counts as weights (`bucketCounts`).

Also fixed: the rollup was written with **dotted keys**, but Firestore's `set()`
treats those as literal field names (only `update()` reads them as paths) — every
histogram would have read back empty forever. `expandIncrements` now writes the
nested shape the aggregator reads.

## Related
[[Admin Analytics]] · [[Conversion KPIs]] · [[Digital Invitations]] ·
[[UX Research Discovery 2026-07-02]] · [[Usability Templates Test Plan]] ·
[[Polling and Realtime]]
