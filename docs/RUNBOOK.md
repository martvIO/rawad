# Dawa Operations Runbook

The "3 a.m. something is broken" guide. Audience: whoever operates **dawa-aa793**
in production (currently a single owner-operator; a co-maintainer is being
onboarded — see [ONBOARDING.md](ONBOARDING.md)).

Companion docs: [deployment.md](deployment.md) (build/deploy), [SMOKE_TEST.md](SMOKE_TEST.md)
(verification), [security.md](security.md) (security model).

---

## 0. First 60 seconds — is it actually down?

```bash
# Is the API alive? (uptimeSeconds climbs; encryption=true means the secret loaded)
curl -s https://dawa-aa793.web.app/api/health
# -> {"ok":true,"uptimeSeconds":1234,"encryption":true}

# Is hosting serving the app?
curl -sI https://dawa-aa793.web.app | head -1     # expect 200

# What is erroring?
npx firebase functions:log --project dawa-aa793 --only api | tail -50
```

| Symptom | Likely cause | Go to |
|---|---|---|
| `/api/health` times out / 5xx | Functions down or cold-crash | §1 |
| `health.encryption:false` | Deploy lost `PASSWORD_ENC_PRIVATE_KEY` | §4 |
| Every API call `not_found` | path-strip regression | [SMOKE_TEST.md §F](SMOKE_TEST.md) |
| Payments not marking paid | Stripe webhook failing | §2 |
| Data wrong / deleted | needs restore | §3 |

---

## 1. Production is down / erroring

1. Confirm scope with `/api/health` + `functions:log` (§0).
2. If a **recent deploy** caused it → **roll back** (§5). Rolling back beats
   debugging live.
3. If not deploy-related: check the [Firebase Status](https://status.firebase.google.com/)
   and GCP status; check function error rate in Cloud Console → Functions.
4. Capture the error (log excerpt) before changing anything so you can fix root cause.

## 2. Stripe payment webhook failing

- Logs: `firebase functions:log --only api | grep payments`.
- The webhook is signature-verified — a 400 usually means the **signing secret**
  drifted from the Stripe dashboard value. Re-set it (§4) and redeploy `api`.
- Stripe Dashboard → Developers → Webhooks shows delivery attempts + lets you
  **resend** a missed event after the fix.

---

## 3. Data incident — RESTORE procedures

> Backups are configured by `backend/scripts/setup-backups.sh`. If that has not
> been run yet, **there is nothing to restore** — run it first (see §6).

### 3a. Restore Realtime Database from backup
Daily JSON snapshots live in `gs://dawa-aa793-backups/rtdb/<YYYY-MM-DD>/`.

```bash
# 1. Pick a day and download it.
gcloud storage ls gs://dawa-aa793-backups/rtdb/
gcloud storage cp gs://dawa-aa793-backups/rtdb/2026-06-20/rtdb-export.json ./rtdb-restore.json

# 2. ALWAYS dry-run into the emulator first and eyeball it.
#    (npm run emulators in another terminal, then:)
#    Inspect rtdb-restore.json — confirm the subtree you need is intact.

# 3. Restore a SPECIFIC subtree (safe) rather than the whole root.
#    Example: one groom's guests after a bad mutation.
npx firebase database:set /guestsByGroom/<groomUid> \
  <(jq '.guestsByGroom["<groomUid>"]' rtdb-restore.json) \
  --project dawa-aa793

# Full-root restore (DANGEROUS — overwrites everything newer):
# npx firebase database:set / rtdb-restore.json --project dawa-aa793
```
Note: snapshots are plain JSON (no export priorities); the schema doesn't use them.

### 3b. Restore Firestore (managed backup or PITR)
```bash
# List managed daily backups:
gcloud firestore backups list --location=us

# Restore a backup into a NEW database (then migrate/compare — never blind-overwrite):
gcloud firestore databases restore \
  --source-backup=projects/dawa-aa793/locations/us/backups/<BACKUP_ID> \
  --destination-database=restore-<date>

# Point-in-time (within the 7-day PITR window): export the past state, then import.
gcloud firestore export gs://dawa-aa793-backups/firestore/<ts> \
  --snapshot-time=2026-06-20T02:00:00Z
gcloud firestore import gs://dawa-aa793-backups/firestore/<ts>
```

### 3c. Restore a Storage object (versioning)
```bash
gcloud storage ls --all-versions gs://dawa-aa793.firebasestorage.app/<path>
# Copy a specific generation back over the live object:
gcloud storage cp "gs://.../<path>#<GENERATION>" "gs://.../<path>"
```

---

## 4. Secret rotation

Secrets are **not** in the repo (correct) — they live in Functions env / Google
Secret Manager. Rotate by updating the secret and redeploying `api`.

| Secret | Where | Rotate when |
|---|---|---|
| `WEB_API_KEY` | Functions env / Secret Manager | suspected leak |
| `PASSWORD_ENC_PRIVATE_KEY` | Secret Manager | suspected leak; regenerate with `node backend/scripts/gen-password-keypair.cjs` |
| Stripe webhook signing secret | Functions env | after any Stripe key reset |
| Firebase **admin-SDK key** (`*-adminsdk-*.json`, repo root) | local file only | gitignored, **not in git history** (verified) — on-disk risk only; see §7 |
| Portal passwords (admin/groom/**driver**/rawad) | Auth | `node backend/functions/scripts/resetUser.js <user>` — rotate as precaution if ever shared insecurely (only emulator seed creds are in history) |

After rotating a Functions secret: `npx firebase deploy --only functions:api`
then confirm `health.encryption:true`.

---

## 5. Rollback

```bash
# Hosting (frontend): re-pin a previous release
npx firebase hosting:versions:list --project dawa-aa793
npx firebase hosting:clone dawa-aa793:live dawa-aa793:live --version <VERSION_ID>

# Functions: redeploy the previous build from a git tag (see CHANGELOG.md)
git checkout <previous-tag>
cd backend/functions && npm run build && cd ../..
npx firebase deploy --only functions:api --project dawa-aa793
git checkout main
```
Tag every release (`git tag vX.Y.Z`) so "the previous build" is unambiguous.

---

## 6. Backup operations (steady state)

- **Setup (once):** `bash backend/scripts/setup-backups.sh` then the manual
  follow-up it prints (add `BACKUP_BUCKET` to env, deploy `backupRtdb`).
- **Verify a run on demand:**
  `gcloud scheduler jobs run firebase-schedule-backupRtdb-us-central1 --location=us-central1`
  then `gcloud storage ls gs://dawa-aa793-backups/rtdb/`.
- **Alert on failure:** the Cloud Monitoring alert on the export job (see
  monitoring setup) should page you if a night is missed. Until that exists,
  spot-check weekly that today's folder appeared.
- **Test a restore quarterly** into the emulator (§3a). Untested backups fail
  when you need them.

---

## 6b. Invite-shell keep-warm (performance)

The `/d/**` invite shell cold-starts in ~6 s (warm: ~0.4 s) — the worst first
impression a guest can get, and it lands on the page that sells the product.
A Cloud Scheduler job pings it every 5 minutes to keep an instance alive.

- **Setup (once):** `bash backend/scripts/setup-keepwarm.sh` — creates the
  `dawa-invite-keepwarm` job. Idempotent; re-run to change the schedule.
- **Check it is alive:**
  `curl -s -o /dev/null -w '%{time_starttransfer}s\n' https://dawa.to/d/keepwarm/keepwarm`
  Well under 1 s means warm. Repeated ~6 s means the job is not firing —
  `gcloud scheduler jobs describe dawa-invite-keepwarm --location=us-central1`.
- **Deliberate limitation:** this is best-effort, not `minInstances: 1`. An
  instance can still be evicted, and each deploy costs one cold hit. If real
  guests are ever measured hitting 6 s loads (`inviteMetrics` field vitals),
  escalate to `minInstances: 1` on `digitalInvitePreview` (~$5–10/mo).

---

## 7. Known security debt (handoff blockers)

1. **Secrets in history — verified clean locally; confirm the remote.** Local
   all-refs history is clean: the admin-SDK key is gitignored and was never
   committed, and `backend/functions/.env` (AWS keys) is gitignored too — only a
   test-fixture key + emulator seed passwords (`Admin1234`/`Driver1234`) exist in
   history. Before a co-maintainer handoff, run `gitleaks detect` on a *fresh
   clone of the remote* to confirm no secret was ever pushed on a branch/PR not
   present locally. If clean (as expected), **no history scrub is needed.** The
   real residual risk is on-disk: move the admin-SDK key + `.env` out of the
   OneDrive-synced folder into Secret Manager. Rotate driver/rawad passwords only
   if they were ever shared insecurely. (CI now runs a `gitleaks` job on every PR.)
2. **No staging environment** — deploys go straight to prod. Use Firebase
   Hosting **preview channels** (`firebase hosting:channel:deploy <name>`) for
   risky frontend changes.

---

## 8. Escalation

Single operator today. Define + fill in before the co-maintainer starts:
- Primary on-call: ____________  (phone / WhatsApp)
- Firebase/GCP project owner: ____________
- Stripe account owner: ____________
- Meta/WhatsApp Business admin: ____________
- AWS (Rekognition/Cognito) account owner: ____________

---

## 9. Owner activation checklist (post-2026-06-20 audit)

The 2026-06-20 audit remediation shipped the *code*; these steps need owner
access (cloud consoles, accounts, secrets, content) and cannot be done from the
codebase. Roughly highest value-to-effort first. Full rationale: `docs/WEB-AUDIT-2026-06-20.md`.

- [ ] **Set the WhatsApp business number** (Admin → Communication Settings). Until
      set, `/api/settings/public` returns `{}` and every landing "book" CTA
      silently falls back to the login wall. ~2 min, unblocks the whole funnel.
- [ ] **GCP + AWS budget alerts** (₪50–100 / $5–10, email at 50/90/100%). Free.
      Do this *before* turning on any paid integration — a runaway function or
      Rekognition loop is the main bankruptcy risk. `api` is already capped at
      `maxInstances:20`.
- [ ] **Enable backups + test one restore.** `bash backend/scripts/setup-backups.sh`,
      set `BACKUP_BUCKET=dawa-aa793-backups` in functions env, deploy
      `functions:backupRtdb`, force a run, then rehearse a restore (§3). Untested
      backup ≠ backup.
- [ ] **Monitoring on `/api/health`** — UptimeRobot (free) keyword `"ok":true`,
      alert after 2 fails. Create a Sentry project → set `SENTRY_DSN` (Functions)
      + `VITE_SENTRY_DSN` (frontend build); `/api/health` then reports
      `monitoring:true`.
- [ ] **Make CI required** — GitHub → Settings → Branches → protect `main` →
      require the `unit` + `integration` checks (e2e advisory).
- [ ] **Confirm the remote is secret-clean** — `gitleaks detect` on a fresh clone
      (see §7); then move the on-disk admin-SDK key + `functions/.env` out of the
      OneDrive folder into Secret Manager.
- [ ] **Testimonials** — paste 3–6 real, consented AR+HE quotes into the
      `testimonials` array in `frontend/src/i18n/{ar,he}.js` (the section is built
      and hidden until non-empty).
- [ ] **Go-live integration secrets** (after budget alerts): Stripe live keys,
      WhatsApp Cloud API creds, AWS Rekognition backend creds.
- [ ] **Export `og-default.png`** (1200×630) from `frontend/public/og-default.svg`
      for max link-preview crawler coverage, then point the og:image meta at it.
- [ ] **KPI baseline** — capture ~1 month from the admin analytics dashboard, then
      set targets (`docs/KPIS.md`). Optional: GA4/Clarity (needs a consent banner).

### From the 2026-07-16 web-quality audit (`Reports/WEB-QUALITY-2026-07-16.md`)

- [ ] **Run the invite keep-warm setup** — `bash backend/scripts/setup-keepwarm.sh`
      (needs authenticated gcloud; §6b). Kills the measured 6 s cold start on the
      guest-facing invite page. Until this runs, PERF-06 is still live in prod.
- [ ] **Add the `www.dawa.to` DNS record** — currently `www` has *no* record at all,
      so `https://www.dawa.to` fails to connect for anyone who types it. Add it as a
      custom domain in Firebase Hosting (Console → Hosting → Add custom domain →
      `www.dawa.to`) and create the CNAME/A records it prints at the registrar. The
      CORS config already anticipates the origin. (SEO-04)
- [ ] **Phone-smoke the Face Liveness scan** once after the next deploy. The
      `fast-xml-parser` override (frontend/package.json) touches the AWS Amplify
      dependency tree; the built bundle is byte-identical and the parser was already
      tree-shaken out, so this is a low-risk confirmation — but liveness needs a real
      face and cannot be tested headlessly (same constraint as TASK-FACE-3).
