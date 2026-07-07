// Groom-facing API sweep — exercises EVERY endpoint the mobile app (@dawa/core
// services: auth.js, digitalInvitation.js, lifecycle.js, publicSettings.js) calls,
// and verifies each response matches the shape the shared service reads.
//
// Run: node scratchpad/groom-api-sweep.mjs
// Emulator API base is fixed below. Uses global fetch (Node 20+/26).

const BASE = "http://127.0.0.1:5001/dawa-aa793/us-central1/api";

// ─── tiny test harness ──────────────────────────────────────────────────────
const results = [];   // { name, method, path, status, ok, shape, note }
let idToken = null;
let refreshToken = null;
let uid = null;

function record(r) {
  results.push(r);
  const badge = r.ok ? "PASS" : "FAIL";
  const shape = r.shape === undefined ? "" : r.shape ? " shape:OK" : " shape:MISMATCH";
  console.log(
    `[${badge}] ${r.method.padEnd(6)} ${r.path.padEnd(48)} -> ${String(r.status).padEnd(4)}${shape}` +
      (r.note ? `  (${r.note})` : "")
  );
}

async function call(method, path, { body, auth = true, skipAuthHeader = false } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && !skipAuthHeader && idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, ok2xx: res.status >= 200 && res.status < 300 };
}

// ─── the sweep ──────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Dawa groom-facing API sweep ===\n");

  // 1) POST /auth/login  (skipAuth)  -- signIn()
  {
    const r = await call("POST", "/auth/login", {
      auth: false,
      body: { username: "groom", password: "Groom1234" },
    });
    const j = r.json || {};
    idToken = j.idToken;
    refreshToken = j.refreshToken;
    uid = j.uid;
    const shape =
      typeof j.idToken === "string" &&
      typeof j.refreshToken === "string" &&
      typeof j.uid === "string" &&
      j.role === "groom" &&
      typeof j.username === "string";
    record({
      name: "auth.login",
      method: "POST",
      path: "/auth/login",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `uid=${uid} role=${j.role}`,
    });
    if (!idToken || !uid) {
      console.error("\nFATAL: login did not return idToken+uid; aborting sweep.");
      finish();
      return;
    }
  }

  // 2) GET /auth/me  -- fetchProfile()/subscribeAuth()
  {
    const r = await call("GET", "/auth/me");
    const j = r.json || {};
    const shape =
      j.uid === uid &&
      j.role === "groom" &&
      typeof j.username === "string" &&
      "displayName" in j &&
      "phoneE164" in j &&
      j.claims && typeof j.claims === "object" && j.claims.role === "groom";
    record({
      name: "auth.me",
      method: "GET",
      path: "/auth/me",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `claims.role=${j.claims?.role}`,
    });
  }

  // 3) POST /auth/change-password  WITH WRONG CURRENT PW  -- must FAIL (401), pw unchanged
  {
    const r = await call("POST", "/auth/change-password", {
      body: { currentPassword: "WrongPass123", newPassword: "NewGroom1234" },
    });
    const rejected = r.status === 401 || (!r.ok2xx && r.json?.error);
    record({
      name: "auth.change-password (wrong current pw)",
      method: "POST",
      path: "/auth/change-password",
      status: r.status,
      ok: rejected, // success == server correctly REJECTED the change
      shape: !r.ok2xx,
      note: `expected rejection; error=${r.json?.error ?? "n/a"} (password NOT changed)`,
    });
  }

  // 4) POST /auth/refresh  (skipAuth body)  -- forceRefreshToken()/tokenManager
  {
    const r = await call("POST", "/auth/refresh", {
      auth: false,
      body: { refreshToken },
    });
    const j = r.json || {};
    const shape =
      typeof j.idToken === "string" &&
      typeof j.refreshToken === "string" &&
      typeof j.expiresIn === "string";
    // Keep using the ORIGINAL idToken for the rest so logout (last) revokes cleanly.
    record({
      name: "auth.refresh",
      method: "POST",
      path: "/auth/refresh",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
    });
  }

  // ─── DIGITAL: designs (call first so ensureMigrated seeds the default design) ──

  // 5) GET /digital/{uid}/designs  -- subscribeDesigns()
  let defaultDesignId = null;
  {
    const r = await call("GET", `/digital/${uid}/designs`);
    const arr = Array.isArray(r.json) ? r.json : [];
    const first = arr[0] || {};
    const shape =
      Array.isArray(r.json) &&
      arr.length > 0 &&
      typeof first.id === "string" &&
      "title" in first &&
      "order" in first &&
      "designStatus" in first &&
      "isDefault" in first;
    defaultDesignId = (arr.find((d) => d.isDefault) || first).id || null;
    record({
      name: "digital.designs.list",
      method: "GET",
      path: `/digital/${uid}/designs`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `count=${arr.length} default=${defaultDesignId}`,
    });
  }

  // 6) POST /digital/{uid}/designs  -- createDesign()  (KEEP design, left behind)
  let keepDesignId = null;
  {
    const r = await call("POST", `/digital/${uid}/designs`, {
      body: { title: "QA Keep Design" },
    });
    const j = r.json || {};
    keepDesignId = typeof j.id === "string" ? j.id : null;
    const shape = typeof j.id === "string";
    record({
      name: "digital.designs.create (keep)",
      method: "POST",
      path: `/digital/${uid}/designs`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `id=${keepDesignId}`,
    });
  }

  // 7) POST /digital/{uid}/designs  -- second design purely to exercise DELETE
  let deleteDesignId = null;
  {
    const r = await call("POST", `/digital/${uid}/designs`, {
      body: { title: "QA Delete Design" },
    });
    const j = r.json || {};
    deleteDesignId = typeof j.id === "string" ? j.id : null;
    record({
      name: "digital.designs.create (throwaway)",
      method: "POST",
      path: `/digital/${uid}/designs`,
      status: r.status,
      ok: r.ok2xx && typeof j.id === "string",
      shape: typeof j.id === "string",
      note: `id=${deleteDesignId}`,
    });
  }

  // 8) GET /digital/{uid}/designs/{id}  -- subscribeDesign()
  {
    const id = keepDesignId || defaultDesignId;
    const r = await call("GET", `/digital/${uid}/designs/${id}`);
    const j = r.json || {};
    const shape =
      j && typeof j === "object" &&
      j.designId === id &&
      "photographerPublished" in j &&
      Array.isArray(j.guestRanks);
    record({
      name: "digital.designs.get-one",
      method: "GET",
      path: `/digital/${uid}/designs/${id}`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `designId=${j.designId}`,
    });
  }

  // 9) PATCH /digital/{uid}/designs/{id}  -- patchDesignById()
  //    autosave a scalar + nested starfield {color,size,opacity} + envelope override
  {
    const id = keepDesignId || defaultDesignId;
    const r = await call("PATCH", `/digital/${uid}/designs/${id}`, {
      body: {
        brideName: "QA Bride",
        themeColor: "gold",
        starfield: { color: "#ffddaa", size: 1.2, opacity: 0.8 },
        envelope: { wax: "#aa0000" },
      },
    });
    const shape = r.json?.ok === true;
    record({
      name: "digital.designs.patch (scalar+starfield+envelope)",
      method: "PATCH",
      path: `/digital/${uid}/designs/${id}`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
    });
  }

  // 10) POST .../design/submit  -- submitDesignById()  (draft -> pending_approval)
  {
    const id = keepDesignId || defaultDesignId;
    const r = await call("POST", `/digital/${uid}/designs/${id}/design/submit`, { body: {} });
    const j = r.json || {};
    const shape = j.ok === true && "designVersion" in j && "designSubmittedAt" in j;
    record({
      name: "digital.design.submit",
      method: "POST",
      path: `/digital/${uid}/designs/${id}/design/submit`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `designVersion=${j.designVersion}`,
    });
  }

  // 11) POST .../design/cancel  -- cancelDesignById()  (pending_approval -> draft)
  {
    const id = keepDesignId || defaultDesignId;
    const r = await call("POST", `/digital/${uid}/designs/${id}/design/cancel`, { body: {} });
    const shape = r.json?.ok === true;
    record({
      name: "digital.design.cancel",
      method: "POST",
      path: `/digital/${uid}/designs/${id}/design/cancel`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
    });
  }

  // 12) DELETE /digital/{uid}/designs/{id}  -- deleteDesign()  (throwaway only)
  {
    const r = await call("DELETE", `/digital/${uid}/designs/${deleteDesignId}`);
    const j = r.json || {};
    const shape = j.ok === true && "defaultDesignId" in j && "reassignedGuests" in j;
    record({
      name: "digital.designs.delete (throwaway)",
      method: "DELETE",
      path: `/digital/${uid}/designs/${deleteDesignId}`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `reassignedGuests=${j.reassignedGuests}`,
    });
  }

  // ─── DIGITAL: media doc ────────────────────────────────────────────────────

  // 13) GET /digital/{uid}/media  -- subscribeDigitalMedia()
  {
    const r = await call("GET", `/digital/${uid}/media`);
    const j = r.json;
    // App reads media/heroMedia defensively (Array.isArray(doc?.media)?...:[]),
    // so the server omitting them when empty is a valid, app-tolerated shape.
    const mediaOk = j?.media === undefined || Array.isArray(j.media);
    const shape =
      j && typeof j === "object" &&
      "designId" in j &&
      "photographerPublished" in j &&
      Array.isArray(j.guestRanks) &&
      mediaOk;
    record({
      name: "digital.media.get",
      method: "GET",
      path: `/digital/${uid}/media`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `media[]=${Array.isArray(j?.media) ? j.media.length : "omitted(empty)"}`,
    });
  }

  // 14) PATCH /digital/{uid}/media/settings  -- setWeddingDate/setGuestRanks/patchDesignFields
  {
    const weddingDate = Date.now() + 90 * 24 * 60 * 60 * 1000; // ~90 days out, epoch ms
    const r = await call("PATCH", `/digital/${uid}/media/settings`, {
      body: {
        weddingDate,
        guestRanks: ["VIP", "Family", "Friend"],
        countdownEnabled: true,
      },
    });
    const shape = r.json?.ok === true;
    record({
      name: "digital.media.settings.patch (weddingDate+guestRanks+flag)",
      method: "PATCH",
      path: `/digital/${uid}/media/settings`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
    });
  }

  // 15) POST /digital/{uid}/media/delete-item  -- removeInvitationMedia()
  //     Well-formed but nonexistent storagePath: proves the endpoint contract
  //     (prefix validation + {ok:true}) without needing a prior upload.
  {
    const storagePath = `digitalMedia/${uid}/nonexistent_qa_sweep.jpg`;
    const r = await call("POST", `/digital/${uid}/media/delete-item`, {
      body: { storagePath },
    });
    const shape = r.json?.ok === true;
    record({
      name: "digital.media.delete-item",
      method: "POST",
      path: `/digital/${uid}/media/delete-item`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: "nonexistent path -> {ok:true} (idempotent prune)",
    });
  }

  // ─── DIGITAL: guests ───────────────────────────────────────────────────────

  // 16) GET /digital/{uid}/guests  -- subscribeDigitalGuests()
  {
    const r = await call("GET", `/digital/${uid}/guests`);
    const shape = Array.isArray(r.json);
    record({
      name: "digital.guests.list",
      method: "GET",
      path: `/digital/${uid}/guests`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `count=${Array.isArray(r.json) ? r.json.length : "n/a"}`,
    });
  }

  // 17-20) POST /digital/{uid}/guests  -- addDigitalGuest()  (create fixtures)
  // Israeli local format "0" + 9 national digits (10 chars) so ilNational() keeps
  // 9 digits after dropping the leading 0. "05" + 8 unique digits = valid mobile.
  const guestIds = {};
  const base = 10000000 + (Date.now() % 80000000); // 8 digits
  const guestSpecs = [
    { key: "alpha", name: "QA Guest Alpha", phone: "05" + (base + 1), ranks: ["VIP"] },
    { key: "bravo", name: "QA Guest Bravo", phone: "05" + (base + 2), ranks: [] },
    { key: "charlie", name: "QA Guest Charlie", phone: "05" + (base + 3), ranks: ["Family"] },
    { key: "delete", name: "QA Guest Delete", phone: "05" + (base + 4), ranks: [] },
  ];
  for (const g of guestSpecs) {
    const body = { name: g.name, phone: g.phone };
    if (g.ranks.length) body.ranks = g.ranks;
    const r = await call("POST", `/digital/${uid}/guests`, { body });
    const j = r.json || {};
    guestIds[g.key] = typeof j.id === "string" ? j.id : null;
    const shape =
      typeof j.id === "string" &&
      j.name === g.name &&
      j.status === "pending" &&
      typeof j.createdAt === "number" &&
      typeof j.phone === "string";
    record({
      name: `digital.guests.create (${g.key})`,
      method: "POST",
      path: `/digital/${uid}/guests`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `id=${guestIds[g.key]} phone=${j.phone}`,
    });
  }

  // 21) PATCH /digital/{uid}/guests/{id}  -- updateDigitalGuest()  (status)
  {
    const id = guestIds.alpha;
    const r = await call("PATCH", `/digital/${uid}/guests/${id}`, {
      body: { status: "attending" },
    });
    const shape = r.json?.ok === true;
    record({
      name: "digital.guests.patch (status)",
      method: "PATCH",
      path: `/digital/${uid}/guests/${id}`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
    });
  }

  // 22) PATCH /digital/{uid}/guests/{id}  -- updateDigitalGuest()  (ranks + name)
  {
    const id = guestIds.bravo;
    const r = await call("PATCH", `/digital/${uid}/guests/${id}`, {
      body: { ranks: ["Family", "Friend"], name: "QA Guest Bravo (edited)" },
    });
    const shape = r.json?.ok === true;
    record({
      name: "digital.guests.patch (ranks+name)",
      method: "PATCH",
      path: `/digital/${uid}/guests/${id}`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
    });
  }

  // 23) PATCH /digital/{uid}/guests  -- updateManyDigitalGuests()  (bulk ranks)
  {
    const updates = [
      { id: guestIds.alpha, ranks: ["VIP", "Family"] },
      { id: guestIds.charlie, ranks: ["Friend"] },
    ];
    const r = await call("PATCH", `/digital/${uid}/guests`, { body: { updates } });
    const j = r.json || {};
    const shape = j.ok === true && typeof j.count === "number";
    record({
      name: "digital.guests.patch-many (bulk ranks)",
      method: "PATCH",
      path: `/digital/${uid}/guests`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `count=${j.count}`,
    });
  }

  // 24) DELETE /digital/{uid}/guests/{id}  -- removeDigitalGuest()  (throwaway only)
  {
    const id = guestIds.delete;
    const r = await call("DELETE", `/digital/${uid}/guests/${id}`);
    const shape = r.json?.ok === true;
    record({
      name: "digital.guests.delete (throwaway)",
      method: "DELETE",
      path: `/digital/${uid}/guests/${id}`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
    });
  }

  // ─── DIGITAL: photographer ─────────────────────────────────────────────────

  // 25) GET /digital/{uid}/photographer  -- subscribePhotographerFiles()
  {
    const r = await call("GET", `/digital/${uid}/photographer`);
    const shape = Array.isArray(r.json);
    record({
      name: "digital.photographer.list",
      method: "GET",
      path: `/digital/${uid}/photographer`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `count=${Array.isArray(r.json) ? r.json.length : "n/a"}`,
    });
  }

  // 26) POST .../photographer/create-upload  valid small size -- directPhotographerUpload() step1
  {
    const r = await call("POST", `/digital/${uid}/photographer/create-upload`, {
      body: { name: "qa-photo.jpg", contentType: "image/jpeg", size: 2048 },
    });
    const j = r.json || {};
    const shape =
      typeof j.uploadUrl === "string" && j.uploadUrl.length > 0 &&
      typeof j.storagePath === "string" && j.storagePath.startsWith(`photographerFiles/${uid}/`);
    record({
      name: "digital.photographer.create-upload (valid)",
      method: "POST",
      path: `/digital/${uid}/photographer/create-upload`,
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `storagePath=${j.storagePath ? "ok" : "missing"}`,
    });
  }

  // 27) POST .../photographer/create-upload  size 0  -- must 4xx (413)
  {
    const r = await call("POST", `/digital/${uid}/photographer/create-upload`, {
      body: { name: "qa-zero.jpg", contentType: "image/jpeg", size: 0 },
    });
    const rejected = !r.ok2xx && (r.status === 413 || r.status === 400);
    record({
      name: "digital.photographer.create-upload (size 0)",
      method: "POST",
      path: `/digital/${uid}/photographer/create-upload`,
      status: r.status,
      ok: rejected,
      shape: !r.ok2xx,
      note: `expected 4xx; error=${r.json?.error ?? "n/a"}`,
    });
  }

  // 28) POST .../photographer/create-upload  size > 2GB  -- must 4xx (413)
  {
    const tooBig = 2 * 1024 * 1024 * 1024 + 1; // MAX_PHOTOG_BYTES + 1
    const r = await call("POST", `/digital/${uid}/photographer/create-upload`, {
      body: { name: "qa-huge.jpg", contentType: "image/jpeg", size: tooBig },
    });
    const rejected = !r.ok2xx && (r.status === 413 || r.status === 400);
    record({
      name: "digital.photographer.create-upload (>2GB)",
      method: "POST",
      path: `/digital/${uid}/photographer/create-upload`,
      status: r.status,
      ok: rejected,
      shape: !r.ok2xx,
      note: `expected 4xx; error=${r.json?.error ?? "n/a"} maxBytes=${r.json?.maxBytes ?? "n/a"}`,
    });
  }

  // ─── LIFECYCLE (order leaves groom ACTIVE) ─────────────────────────────────

  // 29) GET /lifecycle/me  -- getMyLifecycle()
  {
    const r = await call("GET", "/lifecycle/me");
    const j = r.json || {};
    const shape = typeof j.lifecycleStatus === "string";
    record({
      name: "lifecycle.me",
      method: "GET",
      path: "/lifecycle/me",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `status=${j.lifecycleStatus}`,
    });
  }

  // 30) POST /lifecycle/pause  -- pauseWedding()  (active -> paused)
  {
    const r = await call("POST", "/lifecycle/pause", { body: {} });
    const j = r.json || {};
    const shape = j.ok === true && j.lifecycleStatus === "paused";
    record({
      name: "lifecycle.pause",
      method: "POST",
      path: "/lifecycle/pause",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `status=${j.lifecycleStatus}`,
    });
  }

  // 31) POST /lifecycle/resume  -- resumeWedding()  (paused -> active)
  {
    const r = await call("POST", "/lifecycle/resume", { body: {} });
    const j = r.json || {};
    const shape = j.ok === true && j.lifecycleStatus === "active";
    record({
      name: "lifecycle.resume",
      method: "POST",
      path: "/lifecycle/resume",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `status=${j.lifecycleStatus}`,
    });
  }

  // 32) POST /lifecycle/cancel  -- requestCancellation()  (active -> cancel_pending)
  {
    const r = await call("POST", "/lifecycle/cancel", { body: { reason: "QA sweep" } });
    const j = r.json || {};
    const shape =
      j.ok === true && j.lifecycleStatus === "cancel_pending" && "cancelGraceEndsAt" in j;
    record({
      name: "lifecycle.cancel",
      method: "POST",
      path: "/lifecycle/cancel",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `status=${j.lifecycleStatus}`,
    });
  }

  // 33) POST /lifecycle/cancel/undo  -- undoCancellation()  (cancel_pending -> active)
  {
    const r = await call("POST", "/lifecycle/cancel/undo", { body: {} });
    const j = r.json || {};
    const shape = j.ok === true && j.lifecycleStatus === "active";
    record({
      name: "lifecycle.cancel.undo",
      method: "POST",
      path: "/lifecycle/cancel/undo",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `status=${j.lifecycleStatus} (groom left ACTIVE)`,
    });
  }

  // ─── PUBLIC settings (skipAuth) ────────────────────────────────────────────

  // 34) GET /settings/public  -- fetchPublicSettings()
  {
    const r = await call("GET", "/settings/public", { auth: false });
    const shape = r.json && typeof r.json === "object" && !Array.isArray(r.json);
    record({
      name: "settings.public",
      method: "GET",
      path: "/settings/public",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
      note: `keys=${r.json ? Object.keys(r.json).join(",") || "(none)" : "n/a"}`,
    });
  }

  // ─── LOGOUT (LAST — revokes refresh tokens) ────────────────────────────────

  // 35) POST /auth/logout  -- signOutNow()
  {
    const r = await call("POST", "/auth/logout", { body: {} });
    const shape = r.json?.ok === true;
    record({
      name: "auth.logout",
      method: "POST",
      path: "/auth/logout",
      status: r.status,
      ok: r.ok2xx && shape,
      shape,
    });
  }

  finish();
}

function finish() {
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log("\n=== SUMMARY ===");
  console.log(`total=${total}  pass=${passed}  fail=${failed.length}`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.method} ${f.path} -> ${f.status} (${f.note ?? ""})`);
    }
  }
  console.log(`\n${failed.length === 0 ? "OVERALL: PASS" : "OVERALL: FAIL"}`);
  // Machine-readable line for the caller.
  console.log("\n__JSON__" + JSON.stringify({ total, passed, failed: failed.length, results }));
}

main().catch((e) => {
  console.error("SWEEP CRASHED:", e);
  finish();
  process.exit(1);
});
