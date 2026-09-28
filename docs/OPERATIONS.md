# Operations runbook

## Health and diagnostics

- `GET /api/health` returns database readiness, safe provider modes, version and uptime without credentials.
- **Settings → Connected services** shows Groq, Hindsight, Postgres and cache connectivity.
- Every API response includes `x-request-id`; structured logs include the same value for failures.
- Groq/Hindsight time out. Analysis falls back to local reasoning/retrieval; verify the returned `providerMode` rather than assuming an external model answered.

## Credential rotation

1. Revoke a compromised Groq/Hindsight key at its provider.
2. Create a replacement key, store it in the hosting secret manager and redeploy/restart.
3. Rotate `LISA_API_TOKEN` if exposed; active signed cookies are invalidated when it changes.
4. Review Git history and logs for exposure. Removing a secret from the current file is not a substitute for revoking it.

## Database and demo data

- Run `npm run db:migrate` against the release database before shifting traffic.
- Back up PostgreSQL and verify restores. Hindsight has its own persistent store and backup plan.
- `npm run demo:reset` is destructive and refuses `NODE_ENV=production`.
- `/api/seed` is disabled in production and is idempotent in development when data already exists.
- The `.lisa/` local file store must never be treated as a backup or production database.

## Incident behaviors

- Groq failure: a deterministic baseline is still returned and tagged as local rules mode.
- Hindsight failure: case analysis uses local lexical fallback and resolved data is written locally; check timeline/provider health to identify the degraded service.
- Redis failure: rate limiting and cache degrade to process-local memory. This is not globally consistent across multiple instances; restore Redis or use a gateway-level shared limiter.
- PostgreSQL failure: API readiness fails; restore database connectivity before accepting case writes.

## PII and external services

Case descriptions, operator notes, and (when enabled) chat turns may be sent to configured Groq/Hindsight providers. Review provider contracts, region, retention, DPA, access policy and organizational data minimization requirements before real customer data is used. The initial product has not implemented field-level PII detection/redaction or end-user access roles.
