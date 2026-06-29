# Security Audit 2026-06-29

Targeted audit of the three vulnerability classes most often introduced by
AI-assisted code generation: **hardcoded secrets**, **injection (SQLi/XSS)**, and
**insecure authentication/crypto**. Full report: `docs/security/audit-2026-06-29.md`.

See also: [[Security Model]] · [[Authentication]] · [[Password Encryption]] ·
[[AI Engineering Rules]] · [[Five-Domain Audit Implementation 2026-06-20]] (which
first corrected the false "secrets-in-history" alarm — this audit confirms it).

## Verdict — clean on all three classes

- **Injection:** SQLi is **N/A** (no SQL anywhere — Firebase RTDB/Firestore only). No XSS
  sinks (`dangerouslySetInnerHTML`/`eval`/`innerHTML` absent); server-built OG/WhatsApp
  HTML is `escapeHtml()`-escaped; NoSQL paths built only from regex-validated tokens/UIDs.
- **Auth/Crypto:** Firebase Admin `verifyIdToken(token, true)` (revocation-checked); passwords
  delegated to Firebase Auth (no MD5/SHA1/plaintext); RSA-**OAEP-SHA256**; CSPRNG tokens
  (`randomBytes`/`randomInt`, never `Math.random`); `timingSafeEqual` HMAC compares; default-deny
  RTDB/Storage/Firestore rules.
- **Secrets:** **no real secret has ever been committed** (gitleaks over 662 commits → 5 hits,
  ALL false positives: 2 test fixtures + 3 public reCAPTCHA *site* keys). Independently confirms
  the earlier correction in [[Five-Domain Audit Implementation 2026-06-20]].

## Scanner baselines (2026-06-29)

| Scanner | Scope | Result |
|---|---|---|
| Semgrep 1.168 (OWASP+JS/TS+secrets, 114 rules) | `frontend/src` + `backend/functions/src`, 323 files | **0 findings** |
| gitleaks 8.30 | full history + working tree | 0 real (5 FPs now allowlisted) |
| pip-audit 2.10 | `loadtest/requirements.txt` | **0 vulns** |
| npm audit | `frontend` + `backend/functions` | 21+21 transitive vulns → finding F-1 |

## Actionable findings

- **F-1 (High)** — transitive npm vulns. **Backend FIXED: 21 → 0** (`npm audit fix --force` → `@sentry/node` v10; clean install + 440 tests pass). **Frontend DEFERRED**: force-bumping breaks the toolchain (vite 8 ✗ `plugin-react` peer; vite 7 breaks JSX test runtime) and the real vulns are **Amplify-pinned** (critical `fast-xml-parser` via `aws-amplify`; low exploitability — parses trusted AWS responses). Reverted to vite-5 state; tracked for a dedicated `aws-amplify` upgrade PR.
- **F-2 (Medium)** — rotate `LEMONSQUEEZY_API_KEY` (its `.env.local` comment says it was shared in plaintext chat). Gitignored, never committed. **User action** in the LS dashboard.
- **F-3 (Low)** — remove unused `STRIPE_SECRET_KEY` from local `.env` (Stripe code path is dormant; Lemon Squeezy is the active provider).
- **F-4 (Low)** — de-hardcode the absolute admin-SDK-key paths in `.claude/settings.local.json` (tracked) → use `$GOOGLE_APPLICATION_CREDENTIALS`.

## Guardrails added (keep it clean going forward)

- **`.gitleaks.toml`** — allowlists the 5 known false positives so the existing CI gitleaks gate
  (`.github/workflows/ci.yml`) stays green and meaningful (finding F-5).
- **`.github/workflows/security.yml`** — Semgrep SAST (`--error`, baseline 0), GitHub
  `dependency-review-action` (blocks newly-vulnerable deps on PRs), advisory `npm audit`, and
  CodeQL (JS/TS, security-and-quality).
- **`.husky/pre-commit`** — `gitleaks protect --staged` so secrets are blocked locally before push
  (best-effort; CI remains the hard gate). Activates after `npm install` at repo root.
