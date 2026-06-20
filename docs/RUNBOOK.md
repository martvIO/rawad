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
| Firebase **admin-SDK key** (`*-adminsdk-*.json`, repo root) | local file only | **see §7 — it is in git history** |
| Portal passwords (admin/groom/**driver**/rawad) | Auth | `node backend/functions/scripts/resetUser.js <user>` — driver/rawad were leaked in history |

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

## 7. Known security debt (handoff blockers)

1. **Admin-SDK key + leaked portal creds are in git history.** Rotating the
   passwords (driver/rawad) mitigates account access, but the key + history
   need scrubbing (`git filter-repo` / BFG) before any repo handoff or making
   it public. Treat the repo as containing live secrets until done.
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
