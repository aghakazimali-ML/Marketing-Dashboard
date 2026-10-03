# Security

Status of the hardening items (IDs from the production-readiness review). "Fixed" items have automated tests in `tests/security.test.ts` unless noted.

| ID | Item | Status |
|---|---|---|
| SEC-1 | Patched Next.js | **Fixed** — Next 16.3.8; `npm audit --omit=dev` is clean and runs in CI (`--audit-level=high`). |
| SEC-2 | Rate limiting | **Fixed** — login limited per IP (30/15 min) **and** per email; 10 failed attempts lock that email for 15 min. Client IP comes from `X-Forwarded-For` only with `TRUST_PROXY=true` (right-most trusted hop, `TRUST_PROXY_HOPS`), never from a client-supplied value. Store sits behind `RateLimitStore` (swap in Redis for multi-instance). |
| SEC-3 | First-owner takeover | **Fixed** — creating the owner needs `SETUP_TOKEN` (constant-time compare) or the `create-owner` CLI. |
| SEC-4 | Security headers | **Fixed** — per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS in production. Verified against a running build. |
| SEC-5 | Open redirect | **Fixed** — `next` must match `^/(?![/\\])`. |
| SEC-6/7 | Encryption keys | **Fixed** — `SECRETS_ENCRYPTION_KEY` is primary; values are `enc:v2:<kid>:…`; `AUTH_SECRET` can only decrypt legacy `enc:v1:`; plaintext is no longer accepted (`npm run rotate-secrets` encrypts/re-encrypts; the Docker entrypoint runs it). |
| SEC-8 | Tokens in URLs | **Fixed** — Meta/Google/LinkedIn calls use `Authorization: Bearer` (test asserts no `access_token` in any URL). |
| SEC-9 | Error leakage | **Fixed** — clients and analysts see short summaries; full upstream text is logged server-side (redacted) and shown only to admins. |
| SEC-10 | Password management | **Fixed** — change password; forgot/reset with single-use, hashed, 30-minute tokens, rate-limited, identical response for unknown emails; the token travels in the URL fragment. |
| SEC-11 | Session revocation | **Fixed** — `sessionVersion` in the JWT is checked against the database on every request; bumped on password change/reset, role change, disable. Roles are always read from the DB. Sessions last 1 h, silently refreshed while active, hard cap 12 h. |
| SEC-12 | Logout | **Fixed** — sign-out in the sidebar / header menu, audited. |
| SEC-13 | Vulnerable `xlsx` | **Fixed** — replaced by `exceljs`; spreadsheet text is formula-neutralised; CSV uses `csvCell`. |
| SEC-14 | Audit log | **Fixed** — logins (success/failure/lockout), invites, role changes, enable/disable, channel and token changes, AI settings, fetches, billing changes. Recorded on every plan; the viewer (Team page) is a Pro feature. |

## Other controls
- **Passwords:** scrypt (16-byte salt), 12–128 characters, timing-equalised unknown-user path.
- **CSRF:** `SameSite=Lax` cookies plus an `Origin` check on state-changing API calls (webhook/cron/API-key routes use their own secret or signature instead).
- **Webhooks:** Stripe signature verified on the raw body; events processed once.
- **Cron:** `CRON_SECRET` (constant-time compare), 503 if unset.
- **OAuth:** signed, 10-minute `state` cookie bound to the signed-in admin; callback verifies it.
- **API keys:** `mdk_…` shown once, stored as SHA-256, revocable, rate-limited per key.
- **AI:** only aggregate selected-period metrics are sent to the provider; null = "not provided".
- **Config:** production start fails fast on weak/missing secrets or a non-https `APP_BASE_URL`.
- **Logs:** structured JSON; token/password/secret-like fields and `Bearer …`/`access_token=` values are redacted.

## Known limitations / operator duties
- Per-email lockout can be used to annoy a known user for 15 minutes; this is the usual trade-off.
- The in-memory rate-limit store is per process. Run one instance, or provide a shared `RateLimitStore`.
- Back up `SECRETS_ENCRYPTION_KEY`: without it stored tokens cannot be decrypted (channels would need reconnecting).
- Set `TRUST_PROXY=true` only behind a proxy that overwrites `X-Forwarded-For`; otherwise per-IP limits share one bucket.
- Dependency audit is only as current as the last `npm audit`; CI re-runs it on every push.
