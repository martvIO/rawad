#!/usr/bin/env bash
#
# setup-backups.sh — one-time disaster-recovery setup for Dawa (dawa-aa793).
#
# WHY: production data lives in THREE stores with NO backups today:
#   • Firestore (digital invites, designs, faces)  → managed PITR + scheduled backups
#   • Realtime Database (users, guests, proofs)     → daily JSON export via backupRtdb fn
#   • Storage (proof photos, face images)           → object versioning + lifecycle
# A single bad mutation / buggy migration / bad actor is currently unrecoverable.
#
# RUN THIS ONCE, as the project owner, in Google Cloud Shell or local Git Bash
# with an authenticated gcloud + firebase CLI. It is safe to re-run (idempotent
# where the APIs allow; "already exists" errors are harmless).
#
# Restore procedures: docs/RUNBOOK.md.
set -euo pipefail

PROJECT="dawa-aa793"
REGION="us-central1"                       # match the Functions/Firestore region
LOCATION="US"                              # multi-region for the backup bucket
DEFAULT_BUCKET="dawa-aa793.firebasestorage.app"   # NOT .appspot.com — see memory
BACKUP_BUCKET="dawa-aa793-backups"
RETENTION_DAYS=30                          # keep DR copies 30d (also honours the
                                           # 30-day biometric-purge promise)

echo "==> Using project: $PROJECT"
gcloud config set project "$PROJECT"

# --- 0. Enable required APIs -------------------------------------------------
gcloud services enable \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com

# --- 1. Dedicated, private backup bucket -------------------------------------
if ! gcloud storage buckets describe "gs://$BACKUP_BUCKET" >/dev/null 2>&1; then
  echo "==> Creating backup bucket gs://$BACKUP_BUCKET"
  gcloud storage buckets create "gs://$BACKUP_BUCKET" \
    --location="$LOCATION" \
    --uniform-bucket-level-access \
    --public-access-prevention
else
  echo "==> Backup bucket already exists"
fi

# 30-day lifecycle so DR copies (incl. any PII/biometric data) age out.
cat > /tmp/backup-lifecycle.json <<JSON
{ "rule": [ { "action": {"type": "Delete"}, "condition": {"age": $RETENTION_DAYS} } ] }
JSON
gcloud storage buckets update "gs://$BACKUP_BUCKET" \
  --lifecycle-file=/tmp/backup-lifecycle.json

# --- 2. Firestore: PITR + managed daily backups ------------------------------
echo "==> Enabling Firestore Point-in-Time Recovery (7-day window)"
gcloud firestore databases update --database='(default)' \
  --enable-pitr || echo "    (PITR may already be enabled)"

echo "==> Creating daily Firestore backup schedule (7-day retention)"
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d || echo "    (a daily schedule may already exist)"

# --- 3. Storage: object versioning + noncurrent-version lifecycle ------------
echo "==> Enabling object versioning on the live bucket"
gcloud storage buckets update "gs://$DEFAULT_BUCKET" --versioning

cat > /tmp/live-lifecycle.json <<JSON
{ "rule": [ {
  "action": {"type": "Delete"},
  "condition": {"daysSinceNoncurrentTime": $RETENTION_DAYS, "isLive": false}
} ] }
JSON
gcloud storage buckets update "gs://$DEFAULT_BUCKET" \
  --lifecycle-file=/tmp/live-lifecycle.json

# --- 4. Let the Functions runtime SA write to the backup bucket --------------
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"  # gen2 default
echo "==> Granting objectAdmin on backup bucket to $RUNTIME_SA"
gcloud storage buckets add-iam-policy-binding "gs://$BACKUP_BUCKET" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/storage.objectAdmin"

# --- 5. Wire BACKUP_BUCKET into the Functions env, then deploy ----------------
cat <<NEXT

================================================================================
Manual follow-up (kept out of this script so it never edits your repo):

  1. Add to backend/functions/.env  (and .env.$PROJECT if you keep per-project):
         BACKUP_BUCKET=$BACKUP_BUCKET

  2. Deploy the backup function + Firestore rules-unaffected functions:
         cd backend/functions && npm run build && cd ../..
         npx firebase deploy --only functions:backupRtdb --project $PROJECT

  3. Verify it works WITHOUT waiting for the 03:30 schedule:
         gcloud scheduler jobs run firebase-schedule-backupRtdb-$REGION \
           --location=$REGION
         gcloud storage ls "gs://$BACKUP_BUCKET/rtdb/"

  4. Test a RESTORE once (into the emulator) — an untested backup is not a
     backup. See docs/RUNBOOK.md → "Restore RTDB from backup".
================================================================================
NEXT

echo "==> setup-backups.sh complete."
