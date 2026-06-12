// Global teardown — no-op for now. The Firebase emulator is shut down by
// whichever process started it (npm run dev:full, firebase emulators:start,
// etc.); deleting users here would race with that shutdown and leave the
// next run with a partial state.
//
// If you want a clean slate between runs, restart the emulators.

export default async function globalTeardown(): Promise<void> {
  // Intentionally empty.
}
