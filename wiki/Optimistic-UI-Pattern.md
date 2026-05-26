---
date: 2026-05-26
sources:
  - KNOWN_BUGS.md
tags: [pattern, bugs, react, polling, concept]
---

# Optimistic UI Pattern

A recurring bug class in [[Dawa]], born from the [[Polling and Realtime|polling architecture]]. Because most views read state from a 15-second poller, any mutation that doesn't also update local state appears broken until the next tick. Several High/Critical bugs traced to this — see [[Known Bugs]].

## The convention (now codified)
1. **Optimistic write:** after an API mutation resolves successfully, mirror the change into local state via `setDoc(prev => ...)`. On failure, skip the local update so the UI reflects actual persisted state.
2. **Subscription transform:** poll-based subscriptions accept a `transform(serverResult)` callback so consumers can reconcile in-flight uploads against each poll result.
3. **Pending map:** track recently-confirmed uploads/deletes in a `pendingPathsRef` (keyed by `storagePath`/`id`). The transform splices missing entries back in and removes ones the server has echoed — so a stale poll mid-upload can't wipe a fresh entry, and a poll mid-delete can't resurrect a deleted one.

A docblock at the top of `DigitalDashboard.jsx` records this convention for future contributors.

## Related server-side races
The same family produced a **read-modify-write race** on the Firestore `media[]` array (N parallel uploads each writing `[existing, file_i]`, last write wins). Fixed with `runTransaction(...)`. See [[Digital Invitations]] and [[Known Bugs]] BUG-O003.
