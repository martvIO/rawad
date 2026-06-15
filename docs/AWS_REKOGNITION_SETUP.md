# AWS Rekognition — one-time setup (owner)

The face-recognition photo features (personal "your photos", the People gallery,
Face Liveness) run on **AWS Rekognition**. The code is already in place but stays
**inert** until these credentials exist — without them the app falls back to the
legacy face-api engine and the new flows no-op. Setup takes ~20 minutes.

> Nothing here is committed to git. Backend creds live in
> `backend/functions/.env.local` (gitignored); the frontend identity-pool id is
> a `VITE_*` value (public by design).

---

## 1. Pick a region

Use a region that supports **both** Rekognition Collections **and** Face
Liveness. Good choices: `eu-west-1` (Ireland — EU data residency), `us-east-1`,
`us-west-2`, `ap-northeast-1`. The examples below use `eu-west-1`.

## 2. Backend IAM user (programmatic access)

Create an IAM user with an access key, and attach this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DawaRekognitionBackend",
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:DeleteCollection",
        "rekognition:ListCollections",
        "rekognition:DescribeCollection",
        "rekognition:IndexFaces",
        "rekognition:SearchFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:DeleteFaces",
        "rekognition:ListFaces",
        "rekognition:CreateFaceLivenessSession",
        "rekognition:GetFaceLivenessSessionResults"
      ],
      "Resource": "*"
    }
  ]
}
```

## 3. Cognito Identity Pool (for the browser Face Liveness widget)

The camera liveness check runs in the browser and needs **temporary** AWS creds.

1. Amazon Cognito → **Identity pools** → Create identity pool.
2. Enable **Guest access** (unauthenticated).
3. On the **unauthenticated role**, attach this minimal policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DawaFaceLivenessStream",
      "Effect": "Allow",
      "Action": ["rekognition:StartFaceLivenessSession"],
      "Resource": "*"
    }
  ]
}
```

4. Note the **Identity pool ID** (looks like `eu-west-1:xxxxxxxx-xxxx-xxxx-...`).

## 4. Set the values

**Backend** — add to `backend/functions/.env.local` (gitignored; the Functions
emulator and the accuracy test both read it):

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-west-1
REKOGNITION_COLLECTION_PREFIX=dawa
```

**Frontend** — add to `frontend/.env.local`:

```
VITE_AWS_REGION=eu-west-1
VITE_COGNITO_IDENTITY_POOL_ID=eu-west-1:xxxxxxxx-xxxx-xxxx-...
```

**Production deploy** (later): set the backend values as Functions secrets
instead of `.env.local`:

```
firebase functions:secrets:set AWS_ACCESS_KEY_ID
firebase functions:secrets:set AWS_SECRET_ACCESS_KEY
# AWS_REGION / REKOGNITION_COLLECTION_PREFIX can stay as plain env config
```

## 5. Verify accuracy on the example photos

With the backend `.env.local` filled:

```
npm run test:rekognition
```

This creates a throwaway collection, indexes `facerec_examples/`, matches each
person's selfie, asserts the grouping equals the `finial_data/` sets, recovers
exactly two people via clustering, then deletes the collection. It costs a few
cents. If it passes, the engine is good to build the rest on.

## Cost (verify against current AWS pricing)

≈ **$1 per 1,000** images indexed, ≈ **$1 per 1,000** searches, a few **cents
per Liveness** check, plus a tiny monthly per-face-vector storage charge.
Per-wedding collections auto-purge ~30 days after the event.
