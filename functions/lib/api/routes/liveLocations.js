"use strict";
// Live-location endpoints — driver GPS publish + groom/admin SSE stream.
//
// Three endpoints replace the legacy `src/services/liveLocations.js` direct
// RTDB writes and the `onValue` subscription:
//
//   POST /live-locations                    driver: publish a fix to shareWith[]
//   POST /live-locations/clear              driver: clear self from formerShareWith[]
//   GET  /live-locations/:groomUid/stream   groom/admin: Server-Sent Events stream
//
// Data model (sharded so per-groom rules work without leaking other grooms):
//   /liveLocationsByGroom/{groomUid}/{driverUid} = { lat, lng, accuracy, timeISO, driverDisplayName? }
//
// SSE rationale:
//   The original client used Firebase's `onValue` to push every change to
//   groom maps. EventSource is the closest browser-native equivalent that
//   does not require a custom WebSocket protocol. The `requireAuth` middleware
//   accepts the idToken via `?token=` query param because EventSource cannot
//   set Authorization headers.
//
// What this file does NOT do:
//   - It does not validate that the driver is currently "assigned" to the
//     groom — drivers can publish to any groomUid they pass. The legacy
//     `database.rules.json` enforces the same (writes are gated only by
//     `$driverUid === auth.uid`). Adding an assignment check would tighten
//     the rules but is out of scope for this migration.
Object.defineProperty(exports, "__esModule", { value: true });
exports.liveLocationsRouter = void 0;
const express_1 = require("express");
const database_1 = require("firebase-admin/database");
const auth_1 = require("../middleware/auth");
// ─── Schema constants (mirror database.rules.json /liveLocationsByGroom) ──────
const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const MIN_ACCURACY_M = 0;
const MAX_ACCURACY_M = 100000;
const MAX_TIME_ISO_LEN = 40;
const MAX_DRIVER_NAME_LEN = 120;
/** Heartbeat interval for SSE — keeps proxies / load balancers from idle-timing out. */
const SSE_HEARTBEAT_MS = 25000;
exports.liveLocationsRouter = (0, express_1.Router)();
// ─── POST /live-locations ─────────────────────────────────────────────────────
/**
 * Driver publishes their current GPS fix to every groom in `shareWith`.
 * The same payload is written to /liveLocationsByGroom/{groomUid}/{driverUid}
 * for each entry — sharded so each groom's `.read` rule can authorize
 * exactly their own bucket.
 *
 * Body shape:
 *   {
 *     shareWith: string[],
 *     fix: { lat: number, lng: number, accuracy?: number },
 *     driverDisplayName?: string
 *   }
 *
 * The driverUid is taken from `req.caller.uid` — never trust a client-supplied
 * driverUid. `timeISO` is set server-side to keep clocks consistent.
 */
exports.liveLocationsRouter.post("/", auth_1.requireAuth, (0, auth_1.requireRole)("driver"), async (req, res) => {
    const parsed = parsePublishBody(req.body);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error, field: parsed.field });
        return;
    }
    const { shareWith, fix, driverDisplayName } = parsed.value;
    if (shareWith.length === 0) {
        // Legacy code returns silently for empty share lists.
        res.json({ ok: true, written: 0 });
        return;
    }
    const driverUid = req.caller.uid;
    const payload = {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy ?? 0,
        timeISO: new Date().toISOString(),
    };
    if (driverDisplayName)
        payload.driverDisplayName = driverDisplayName;
    const updates = {};
    for (const groomUid of shareWith) {
        updates[`liveLocationsByGroom/${groomUid}/${driverUid}`] = payload;
    }
    try {
        await (0, database_1.getDatabase)().ref().update(updates);
        res.json({ ok: true, written: shareWith.length });
    }
    catch (err) {
        res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
});
// ─── POST /live-locations/clear ───────────────────────────────────────────────
/**
 * Driver removes themselves from every groom in `formerShareWith` by
 * writing `null` to each shard. Used when the driver toggles sharing off
 * or signs out.
 *
 * Body shape: `{ formerShareWith: string[] }`
 */
exports.liveLocationsRouter.post("/clear", auth_1.requireAuth, (0, auth_1.requireRole)("driver"), async (req, res) => {
    const formerShareWith = parseGroomUidList(req.body?.formerShareWith);
    if (formerShareWith === null) {
        res.status(400).json({ error: "invalid_former_share_with" });
        return;
    }
    if (formerShareWith.length === 0) {
        res.json({ ok: true, cleared: 0 });
        return;
    }
    const driverUid = req.caller.uid;
    const updates = {};
    for (const groomUid of formerShareWith) {
        updates[`liveLocationsByGroom/${groomUid}/${driverUid}`] = null;
    }
    try {
        await (0, database_1.getDatabase)().ref().update(updates);
        res.json({ ok: true, cleared: formerShareWith.length });
    }
    catch (err) {
        res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
});
// ─── GET /live-locations/:groomUid/stream (SSE) ───────────────────────────────
/**
 * Server-Sent Events stream of all drivers currently sharing with this groom.
 * Replaces the client's `onValue` listener. Emits the full snapshot value
 * (an object `{ [driverUid]: payload }`) on every change.
 *
 * Authorization mirrors `database.rules.json`:
 *   - admins: any groomUid
 *   - groom: only their own (`req.caller.uid === groomUid`)
 *
 * Lifecycle:
 *   - Attaches a `.on("value")` RTDB listener.
 *   - Emits an initial snapshot (RTDB fires `value` once for the current state).
 *   - Sends a `:heartbeat\n\n` comment every 25s so idle proxies don't drop us.
 *   - On client disconnect (`req.on("close")`), detaches the listener and
 *     clears the heartbeat timer.
 *
 * Token transport: EventSource cannot set custom headers, so the client
 * passes `?token=<idToken>`. `requireAuth` already supports this fallback.
 */
exports.liveLocationsRouter.get("/:groomUid/stream", auth_1.requireAuth, (req, res) => {
    const { groomUid } = req.params;
    if (!canReadGroom(req, groomUid)) {
        res.status(403).json({ error: "forbidden" });
        return;
    }
    openSseStream(req, res, groomUid);
});
// ─── SSE plumbing ─────────────────────────────────────────────────────────────
/**
 * Configure response headers, attach the RTDB listener, and wire up
 * teardown on client disconnect. Splitting this from the route handler
 * keeps the route signature small and the lifecycle explicit.
 */
function openSseStream(req, res, groomUid) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Disable Express's default compression buffering for streams.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const ref = (0, database_1.getDatabase)().ref(`liveLocationsByGroom/${groomUid}`);
    const onValue = (snap) => {
        // `snap.val()` returns null when the node is empty; emit `{}` so the
        // client always sees a JSON object.
        const payload = snap.val() ?? {};
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    const onError = (err) => {
        // eslint-disable-next-line no-console
        console.warn("[live-locations] SSE listener error", err);
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    };
    ref.on("value", onValue, onError);
    const heartbeat = setInterval(() => {
        // SSE comments (lines starting with `:`) are ignored by EventSource but
        // travel the wire — enough to keep idle connections alive.
        res.write(`: heartbeat ${Date.now()}\n\n`);
    }, SSE_HEARTBEAT_MS);
    const cleanup = () => {
        clearInterval(heartbeat);
        ref.off("value", onValue);
    };
    req.on("close", cleanup);
    req.on("aborted", cleanup);
    res.on("close", cleanup);
}
// ─── Authorization ────────────────────────────────────────────────────────────
/**
 * Read access: admin OR the groom themselves.
 * Mirrors `database.rules.json` /liveLocationsByGroom/$groomUid `.read`.
 */
function canReadGroom(req, groomUid) {
    const claims = req.caller.claims;
    if (claims.role === "admin")
        return true;
    if (req.caller.uid === groomUid)
        return true;
    return false;
}
/**
 * Validate the POST /live-locations body. Enforces the same schema as
 * `database.rules.json` /liveLocationsByGroom/$groomUid/$driverUid.
 */
function parsePublishBody(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, error: "invalid_body" };
    }
    const data = body;
    const shareWith = parseGroomUidList(data.shareWith);
    if (shareWith === null) {
        return { ok: false, error: "invalid_share_with", field: "shareWith" };
    }
    const fixRaw = data.fix;
    if (!fixRaw || typeof fixRaw !== "object") {
        return { ok: false, error: "invalid_fix", field: "fix" };
    }
    const lat = fixRaw.lat;
    const lng = fixRaw.lng;
    if (typeof lat !== "number" ||
        !Number.isFinite(lat) ||
        lat < MIN_LAT ||
        lat > MAX_LAT) {
        return { ok: false, error: "invalid_lat", field: "fix.lat" };
    }
    if (typeof lng !== "number" ||
        !Number.isFinite(lng) ||
        lng < MIN_LNG ||
        lng > MAX_LNG) {
        return { ok: false, error: "invalid_lng", field: "fix.lng" };
    }
    let accuracy;
    if (fixRaw.accuracy !== undefined && fixRaw.accuracy !== null) {
        const a = fixRaw.accuracy;
        if (typeof a !== "number" ||
            !Number.isFinite(a) ||
            a < MIN_ACCURACY_M ||
            a > MAX_ACCURACY_M) {
            return { ok: false, error: "invalid_accuracy", field: "fix.accuracy" };
        }
        accuracy = a;
    }
    // The schema also caps timeISO and driverDisplayName — they're set
    // server-side and on-input respectively, so we validate driverDisplayName
    // here and synthesize timeISO in the handler.
    let driverDisplayName;
    if (data.driverDisplayName !== undefined && data.driverDisplayName !== null) {
        const d = data.driverDisplayName;
        if (typeof d !== "string" || d.length > MAX_DRIVER_NAME_LEN) {
            return {
                ok: false,
                error: "invalid_driver_display_name",
                field: "driverDisplayName",
            };
        }
        if (d.length > 0)
            driverDisplayName = d;
    }
    // Sanity check: the placeholder for the server-set timeISO. Length is
    // bounded by `new Date().toISOString()` which is always 24 chars.
    if (MAX_TIME_ISO_LEN < 24) {
        // Unreachable; constant is 40. Guard exists to flag future regressions.
        return { ok: false, error: "internal_time_iso_constant" };
    }
    return {
        ok: true,
        value: {
            shareWith,
            fix: accuracy !== undefined ? { lat, lng, accuracy } : { lat, lng },
            driverDisplayName,
        },
    };
}
/**
 * Coerce a candidate "list of groomUids" into a clean string[]. Returns
 * `null` for any non-array input, and silently drops non-string entries.
 * (The legacy code accepts `null`/`undefined` and treats it as empty.)
 */
function parseGroomUidList(input) {
    if (input === undefined || input === null)
        return [];
    if (!Array.isArray(input))
        return null;
    const out = [];
    for (const entry of input) {
        if (typeof entry === "string" && entry.length > 0 && entry.length <= 128) {
            out.push(entry);
        }
    }
    return out;
}
function errorMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === "string")
        return err;
    return "unknown";
}
//# sourceMappingURL=liveLocations.js.map