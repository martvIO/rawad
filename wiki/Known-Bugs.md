---
date: 2026-05-26
sources:
  - KNOWN_BUGS.md
tags: [bugs, debugging, reference]
---

# Known Bugs

Bug ledger for [[Dawa]] (full detail in `KNOWN_BUGS.md`). Convention: never delete entries — move resolved ones to a Resolved section with a fix date.

## Open
_(none as of 2026-05-26)_

## Resolved — recent (2026-05)
Most resolved bugs cluster around the [[Digital Invitations]] upload/gallery flow and the [[Optimistic UI Pattern]]:

- **BUG-O003** — parallel uploads clobbered the Firestore `media[]` array (read-modify-write race). Fix: `runTransaction(...)`.
- **BUG-O002** — uploads vanished after success toast. Two compounding bugs: `usePortalState.js` never returned `currentUid` (subscription never started) + poll-vs-optimistic race. Fix: return `currentUid`, transform callback, pending-paths merge.
- **BUG-R012** — stale UI after upload/date/rank edits (missing optimistic update); switched uploads to `resumable: true`.
- **BUG-R011** — `api_invalid_multipart` on every upload. Functions v2 pre-consumes the body; fix: feed busboy from `req.rawBody`.
- **BUG-R010** — `getSignedUrl` 500s (service account lacks Token Creator IAM role). Fix: switched to `getDownloadURL` (also fixes URL expiry).
- **BUG-R006** (Critical) — CSP blocked the Cloud Run API domain → infinite spinner. Fix: add domain to `connect-src`, add poller `onError`. See [[Polling and Realtime]].
- **BUG-R003** — RTDB write-after-login silent rollback → moved digital data to Firestore. See [[Data Storage Model]].
- Others: BUG-R001 (tsc stale cache), R002 (undeployed storage rules), R004 (`PASSWORD_LOGIN_DISABLED`), R005 (invite confirmation not shown), R007/R008/R009 (proof photos / add-guest hang / photographer gallery clear).

Pending work lives in [[Tasks Backlog]]; debugging discipline in [[AI Engineering Rules]].
