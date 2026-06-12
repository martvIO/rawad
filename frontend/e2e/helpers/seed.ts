// Seed helper — thin wrapper over the existing scripts/seed-emulator.cjs.
// Creates the three test accounts (admin/groom/driver) plus minimal guest
// records and a driver→groom assignment. Safe to call repeatedly; the
// underlying script is idempotent.

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = resolve(process.cwd(), "scripts/seed-emulator.cjs");

export const TEST_USERS = {
  admin:  { username: "admin",  password: "Admin1234"  },
  groom:  { username: "groom",  password: "Groom1234"  },
  driver: { username: "driver", password: "Driver1234" },
} as const;

export async function seedEmulator(): Promise<void> {
  await new Promise<void>((res, rej) => {
    const proc = spawn(process.execPath, [SCRIPT], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    let stderr = "";
    proc.stdout.on("data", (d) => process.stdout.write(`[seed] ${d}`));
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) res();
      else rej(new Error(`seed-emulator.cjs exited ${code}\n${stderr}`));
    });
    proc.on("error", rej);
  });
}

export async function isEmulatorReachable(host = "127.0.0.1:9099"): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2_000);
    const res = await fetch(`http://${host}/`, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(timer);
    return !!res;
  } catch {
    return false;
  }
}
