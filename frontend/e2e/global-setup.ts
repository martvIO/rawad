// Global setup — runs once before any spec. Seeds the Firebase emulator
// with the three portal accounts and minimal guest data. Skips seeding if
// the emulator isn't reachable (so the spec files can document the skip
// rather than silently mis-passing).

import type { FullConfig } from "@playwright/test";
import { isEmulatorReachable, seedEmulator } from "./helpers/seed";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Prod read-only smoke (npm run test:full:prod) runs against the live hosted
  // site — there is no emulator to seed, and we must never mutate prod data.
  if (process.env.PROD_SMOKE) {
    console.log("[global-setup] PROD_SMOKE — skipping emulator seed (read-only run).");
    return;
  }
  const reachable = await isEmulatorReachable();
  if (!reachable) {
    console.warn("[global-setup] Firebase auth emulator (127.0.0.1:9099) not reachable.");
    console.warn("[global-setup] Start it first: `npm run emulators` or `npm run dev:full`.");
    console.warn("[global-setup] Continuing without seed — tests that need it will fail.");
    return;
  }
  console.log("[global-setup] Seeding emulator with test users + guests...");
  await seedEmulator();
  console.log("[global-setup] Seed complete.");
}
