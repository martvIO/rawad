#!/usr/bin/env bash
#
# setup-keepwarm.sh — one-time Cloud Scheduler setup that keeps the digital-invite
# shell warm for Dawa (dawa-aa793).
#
# WHY: the 2026-07-16 web-quality audit measured the /d/** invite shell at a
# 6.0 s cold-start TTFB, against 0.39 s warm (Reports/WEB-QUALITY-2026-07-16.md,
# PERF-06). The first guest to open an invite after an idle spell stares at a
# blank screen for six seconds BEFORE the SPA even starts booting — on the page
# that sells the product, opened from WhatsApp, usually on mobile data.
#
# This pings the function every 5 minutes so an instance is almost always alive.
#
# WHY THIS AND NOT minInstances: minInstances=1 is the airtight fix (~$5-10/mo)
# and this is not — an instance can still be evicted, and every deploy costs one
# cold hit. The owner chose the ~free best-effort option deliberately. If a real
# guest is ever measured hitting a 6 s cold start again, revisit that call.
#
# WHY A RAW SCHEDULER JOB AND NOT A SCHEDULED FUNCTION: the deploy service account
# lacks cloudscheduler.jobs.update (TASK-DEPLOY-2), so every scheduled function
# already 403s a full `firebase deploy`. A 7th would deepen a known wound. This
# job lives outside the deploy entirely.
#
# RUN THIS ONCE, as the project owner, in Google Cloud Shell or locally with an
# authenticated gcloud. Safe to re-run: it updates the job if it already exists.
set -euo pipefail

PROJECT="dawa-aa793"
REGION="us-central1"          # must match the digitalInvitePreview region
JOB="dawa-invite-keepwarm"
SCHEDULE="*/5 * * * *"        # ~5 min < the ~15 min idle-eviction window

# The token segment is deliberately NOT a real invite token. digitalInvitePreview
# only injects OG tags when the path carries a hex-looking token, so a non-hex
# path warms the same instance while skipping the Firestore read — and, crucially,
# never lands in the guest-experience metrics as a fake invite open.
URL="https://dawa.to/d/keepwarm/keepwarm"

echo "==> Using project: $PROJECT"
gcloud config set project "$PROJECT"

gcloud services enable cloudscheduler.googleapis.com

if gcloud scheduler jobs describe "$JOB" --location="$REGION" >/dev/null 2>&1; then
  echo "==> Updating existing job $JOB"
  ACTION=update
else
  echo "==> Creating job $JOB"
  ACTION=create
fi

gcloud scheduler jobs "$ACTION" http "$JOB" \
  --location="$REGION" \
  --schedule="$SCHEDULE" \
  --time-zone="Asia/Jerusalem" \
  --uri="$URL" \
  --http-method=GET \
  --attempt-deadline=30s \
  --description="Keeps digitalInvitePreview warm — see PERF-06, Reports/WEB-QUALITY-2026-07-16.md"

cat <<NEXT

================================================================================
Verify:

  1. Fire it once by hand and confirm a 200:
         gcloud scheduler jobs run $JOB --location=$REGION
         curl -s -o /dev/null -w '%{http_code} %{time_starttransfer}s\\n' "$URL"

  2. Confirm it is actually warm (a second call should be well under 1 s):
         curl -s -o /dev/null -w '%{time_starttransfer}s\\n' "$URL"

  3. Confirm the warm pings are NOT polluting guest numbers — the invite funnel
     in the admin analytics page should show no new "opens" from these hits.
================================================================================
NEXT

echo "==> setup-keepwarm.sh complete."
