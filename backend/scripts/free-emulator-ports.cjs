#!/usr/bin/env node
/**
 * free-emulator-ports.cjs
 *
 * Kills any process still listening on the Firebase emulator + Vite dev ports.
 *
 * Why this exists: on Windows, Ctrl+C-ing `npm run dev:full` kills the npm
 * wrappers but the *detached Java emulator children* survive and keep holding
 * Firestore (8080) / Database (9000). `firebase emulators:start` then aborts the
 * WHOLE suite with "port taken" — so the Functions emulator (5001) never starts,
 * the site loads but every API call fails. Clearing the ports first makes
 * `dev:full` start reliably every time.
 *
 * Wired as the `predev:full` npm hook (runs automatically before `dev:full`),
 * and runnable on its own via `npm run ports:free`.
 *
 * Flags:
 *   --dry-run   list what would be killed, don't kill anything
 *
 * Cross-platform: uses netstat/taskkill on Windows, lsof/kill elsewhere.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

// --- Build the port list: emulator ports from firebase.json + internals + Vite ---
function emulatorPortsFromConfig() {
  try {
    const cfgPath = path.join(__dirname, "..", "..", "firebase.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    const emu = (cfg && cfg.emulators) || {};
    return Object.values(emu)
      .map((e) => e && e.port)
      .filter((p) => typeof p === "number");
  } catch (err) {
    console.warn(`[free-ports] could not read firebase.json (${err.message}); using defaults`);
    return [9099, 9000, 8080, 9199, 5001, 5000, 4000];
  }
}

const PORTS = Array.from(
  new Set([
    ...emulatorPortsFromConfig(), // auth, database, firestore, storage, functions, hosting, ui
    4400, // emulator hub
    4500, // logging emulator
    9150, // firestore websocket
    5173, // Vite default
    5174, // Vite fallback
    5175, // Vite fallback
  ])
).sort((a, b) => a - b);

const isWin = process.platform === "win32";

/** Return a map of port -> Set(pids) for processes LISTENING on PORTS. */
function findListeners() {
  const byPort = new Map();
  if (isWin) {
    let out = "";
    try {
      // No `-p tcp`: that filter only lists IPv4. Vite (Node) often binds IPv6,
      // so we scan everything and keep the TCP LISTENING rows (v4 and v6 alike).
      out = execSync("netstat -ano", { encoding: "utf8" });
    } catch {
      return byPort;
    }
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      // proto  local  foreign  state  pid
      const local = parts[1] || "";
      const pid = parts[parts.length - 1];
      const m = local.match(/:(\d+)$/);
      if (!m) continue;
      const port = Number(m[1]);
      if (!PORTS.includes(port)) continue;
      if (!pid || pid === "0") continue;
      if (!byPort.has(port)) byPort.set(port, new Set());
      byPort.get(port).add(pid);
    }
  } else {
    for (const port of PORTS) {
      try {
        const out = execSync(`lsof -ti tcp:${port} -s TCP:LISTEN`, { encoding: "utf8" }).trim();
        if (!out) continue;
        const set = new Set(out.split(/\s+/).filter(Boolean));
        if (set.size) byPort.set(port, set);
      } catch {
        /* no listener on this port */
      }
    }
  }
  return byPort;
}

function killPid(pid) {
  try {
    if (isWin) execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
    else execSync(`kill -9 ${pid}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const byPort = findListeners();
if (byPort.size === 0) {
  console.log(`[free-ports] all emulator/Vite ports free (${PORTS.join(", ")})`);
  process.exit(0);
}

// Collect unique pids and which ports they hold (one process can hold several).
const portsByPid = new Map();
for (const [port, pids] of byPort) {
  for (const pid of pids) {
    if (!portsByPid.has(pid)) portsByPid.set(pid, []);
    portsByPid.get(pid).push(port);
  }
}

for (const [pid, ports] of portsByPid) {
  const label = `PID ${pid} (ports ${ports.sort((a, b) => a - b).join(", ")})`;
  if (DRY_RUN) {
    console.log(`[free-ports] would kill ${label}`);
  } else {
    const ok = killPid(pid);
    console.log(`[free-ports] ${ok ? "killed" : "could NOT kill"} ${label}`);
  }
}

if (!DRY_RUN) console.log("[free-ports] done — emulator/Vite ports cleared");
