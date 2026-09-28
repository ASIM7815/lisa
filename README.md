# LISA — Learning Intelligence & Strategy Agent

LISA is a business-operations decision-support agent that improves through a closed learning loop: **case → memory recall → recommendation → human decision → verified outcome → memory retain**. Resolved experiences—not just chat transcripts—are the core product value.

> **Human stays in control.** LISA produces evidence-grounded recommendations. It never issues refunds, contacts customers, changes orders or executes business actions. An operator must approve, modify or reject recommendations, and separately record the real outcome.

## Product features

- Operations dashboard with case volume, service outcomes, recent work and learning indicators.
- Case inbox with search/filter, priority, category, customer details, timeline and imports.
- Case analysis using retrieved experiences, prior outcomes, confidence, rationale, risks and next steps.
- Approve / modify / reject decisions plus an explicit success / partial / failure / unknown resolution record.
- Long-term Hindsight memory (retain, recall and reflect adapter) with local lexical fallback for a zero-key demo.
- Learning adjustments based on human-recorded outcomes; similar cases and their results remain visible to operators.
- LISA Chat, memory explorer, decision audit trail, analytics, knowledge guide and settings.
- Groq and Hindsight credentials are server-side only. No `NEXT_PUBLIC_*` provider secrets.
- PostgreSQL persistence, Redis-backed cache/rate limits, safe local file fallback, API authentication and structured logs.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Groq Chat Completions API (OpenAI-compatible REST interface)
- Hindsight memory REST API (Cloud or self-hosted)
- PostgreSQL (`pg`) for cases, analyses, decisions, timeline and lessons
- Redis (`ioredis`) for cache and shared fixed-window rate limits
- Recharts for analytics, Zod for API input validation, Vitest for tests

## Quick start (local demo)

Requirements: Node.js 20.11+ and npm 10+.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`. If the development database has no cases, the dashboard seeds a small, non-destructive demonstration dataset. It includes successful and unsuccessful outcomes, a pending case and a fresh delivery case, so the learning loop is easy to show. Demo seeding is disabled in production.

With no credentials, the app remains usable with a deterministic rules baseline, local file persistence (`.lisa/data.json`) and lexical memory retrieval. The interface and health endpoint identify these local modes; they are not represented as live Groq/Hindsight/Postgres providers.

To exercise Postgres and Redis locally, start the included services and set these values in `.env` (change `DATABASE_SSL` from `require` to `disable` for the local container):

```bash
docker compose up -d
```

Then add these lines to `.env`:

```dotenv
DATABASE_URL=postgresql://lisa:local-lisa-dev-only@localhost:5432/lisa
DATABASE_SSL=disable
REDIS_URL=redis://:local-redis-dev-only@localhost:6379
```

```bash
npm run demo:reset # destructive; development only
```

## Configure providers

Edit your ignored local `.env`, or use your deployment platform's encrypted secret manager:

```dotenv
GROQ_API_KEY=...                  # https://console.groq.com/keys
GROQ_MODEL=llama-3.3-70b-versatile
HINDSIGHT_API_KEY=...              # Hindsight Cloud Connect page
HINDSIGHT_BASE_URL=https://api.hindsight.vectorize.io
HINDSIGHT_BANK=lisa-operations
DATABASE_URL=postgresql://...      # use your provider's pooled URL on serverless
REDIS_URL=redis://...
LISA_API_TOKEN=...                 # strongly recommended outside a private demo
```

- **Groq:** create a key in GroqCloud. The default model is a production-supported model; choose an active model ID from [Groq's model list](https://console.groq.com/docs/models). The LLM is called only from server routes.
- **Hindsight:** use the API base URL and tenant-scoped key shown on the Hindsight Connect page, or point to your self-hosted server. LISA creates/updates the configured bank on the first retain. Hindsight itself requires its own supported LLM/database deployment.
- **PostgreSQL:** `DATABASE_URL` activates the Postgres driver. Schema bootstrap is idempotent and can run on first request; run `npm run db:migrate` as a deployment step to apply it before serving traffic. `db/schema.sql` is the human-reviewable schema. Set `LISA_AUTO_MIGRATE=false` if migrations are managed externally.
- **Redis:** `REDIS_URL` enables shared cache and rate limits. Without it, a process-local fallback works for development/single-instance demos but is not shared across serverless instances.
- **API access:** when `LISA_API_TOKEN` is set, the UI exchanges it for a signed, HTTP-only, SameSite=Strict cookie. API clients can also use `Authorization: Bearer <LISA_API_TOKEN>`. Store the token in a secret manager; do not put it in frontend configuration.

If an API key was pasted into chat, a ticket, a prompt, or a public repo, **revoke it at the provider immediately and rotate it**. Removing it from a file does not invalidate an exposed key. This repository contains no real provider credentials.

## Production deployment

### Required before production traffic

1. Configure PostgreSQL and run `npm run db:migrate` as a release step. Use a pooled/transaction-pool connection URL where required by serverless providers and tune `DATABASE_POOL_MAX` to the provider's connection budget.
2. Configure `LISA_API_TOKEN` and HTTPS. Production API requests fail closed if `DATABASE_URL` is absent. The local file store is development-only; it is not durable across serverless instances.
3. Configure secret values only in Vercel/hosting encrypted environment settings. Never pass Groq or Hindsight keys as browser variables.
4. Configure Groq and Hindsight for full provider behavior. Confirm `/api/health` and **Settings → Connected services** show the intended modes.
5. Configure Redis for shared rate limiting/cache in multi-instance deployments. Set sensible platform request limits and provider quotas.
6. Review Hindsight's retention/privacy settings and the case/customer data sent to external LLM and memory providers. Apply your organization's lawful basis, redaction, retention and data-processing requirements.
7. Set backups, database restore drills, log/alert collection, dependency update automation, and an incident process for credential rotation.

### Vercel

Import the Git repository as a Next.js project. Add production environment values in Vercel Project Settings, attach managed PostgreSQL and Redis services, run the migration command in a release/build workflow, then deploy. This application uses server-side Next.js route handlers for its backend; browser requests are same-origin relative paths.

`docker-compose.yml` provides local Postgres + Redis for development. Hindsight can be run separately using its official deployment guidance; LISA never stores provider keys in the client bundle.

## API overview

All routes use JSON, stable error envelopes, input validation, same-origin checks for writes, bounded request bodies and request IDs. Except `/api/health` and `/api/auth/*`, routes require the configured session/Bearer auth when `LISA_API_TOKEN` is set.

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/api/cases` | Search/list and create cases |
| GET / PATCH | `/api/cases/:id` | Case, latest analysis, decisions and timeline |
| POST | `/api/cases/:id/analyze` | Recall experience and create a recommendation |
| POST | `/api/cases/:id/decision` | Approve, reject or modify (human action) |
| POST | `/api/cases/:id/resolve` | Record actual outcome and retain the experience |
| GET | `/api/dashboard`, `/api/analytics` | Metrics and trends |
| GET | `/api/memory`, `/api/decisions` | Learning evidence and decision audit |
| GET / POST | `/api/chat` | Chat history and memory-aware chat turn |
| POST | `/api/import` | Import up to 100 validated cases |
| GET / PATCH | `/api/settings` | Workspace settings and service health |
| GET | `/api/health` | Liveness/readiness and provider modes (no secrets) |

## Development and checks

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
# or all key checks together
npm run check
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/OPERATIONS.md](docs/OPERATIONS.md) for design assumptions, deployment notes and limitations.
