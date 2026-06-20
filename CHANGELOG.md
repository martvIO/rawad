# Changelog

All notable production changes to Dawa (dawa-aa793). Newest first.

This file + git tags give "the previous build" an unambiguous meaning for
rollback (see [docs/RUNBOOK.md](docs/RUNBOOK.md) §5). On each release:
`git tag vX.Y.Z && git push --tags`, then add an entry here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Disaster recovery: scheduled `backupRtdb` Cloud Function (daily RTDB → GCS),
  `backend/scripts/setup-backups.sh` (Firestore PITR + managed backups, Storage
  versioning), and restore procedures in `docs/RUNBOOK.md`.
- QA: Playwright now runs across Chromium/Firefox/WebKit + emulated Pixel 7 &
  iPhone 14; real-device smoke matrix added to `docs/SMOKE_TEST.md` §G.
- CI: GitHub Actions pipeline (`.github/workflows/ci.yml`) — unit + security-rules
  + e2e gates on every PR.
- Ops/handoff docs: `RUNBOOK.md` (incident response, restore, secret rotation),
  `ONBOARDING.md` (co-maintainer ramp), `KPIS.md`, `USER_TESTING.md`.
- Accessibility: axe-core checks wired into the e2e suite.
- Tests: Firestore + Storage security-rules coverage.

### Pending owner action (not yet live)
- Enable backup infra (run `setup-backups.sh`, set `BACKUP_BUCKET`, deploy `backupRtdb`).
- GA4 + consent banner + invite-open tracking (needs Measurement ID + UX sign-off).
- Microsoft Clarity heatmaps (needs project ID).
- Sentry + UptimeRobot + Cloud Monitoring alerting (needs DSN/accounts).
- Rotate leaked driver/rawad creds; scrub admin-SDK key from git history.
