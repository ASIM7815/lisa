# Architecture and data flow

## Request path

```text
Browser (same-origin)
  └─ Next.js App Router UI
       └─ /api/* route handlers (auth → rate limit → validation → service)
            ├─ Groq (case analysis and chat; never browser-direct)
            ├─ Hindsight (experience recall, reflect adapter, and retain)
            ├─ PostgreSQL (case system of record)
            └─ Redis (shared cache / rate limits; optional local fallback)
```

## Learning loop

1. An operator creates a case.
2. `analysis-service` builds a bounded case query and asks Hindsight to recall relevant memories. When Hindsight is not configured or unavailable, local embedded retrieval is used and labeled as local.
3. Similar resolved cases and app-side outcome lessons are linked to the trace. A deterministic rules baseline always exists; a configured Groq model may produce a structured recommendation. Invalid/unavailable model output degrades to the local baseline.
4. The recommendation includes why, confidence, action steps, similar outcomes and risk flags. No tools execute the recommended action.
5. `decision-service` records approve / reject / modify and the operator's note.
6. Resolution records the actual outcome and note, constructs a lesson, writes an auditable timeline and retains the full case/decision/action/outcome experience. Hindsight and the local case-linked memory copy are both retained when possible.
7. On later analysis, learned action outcomes add explicit boost/penalty evidence; similar cases remain visible. Outcome weights are transparent and are not trained model weights.

## Data ownership

- PostgreSQL is the application system of record: `cases`, `analyses`, `decisions`, `timeline`, `lessons`, `memory_units`, `chat_messages`, `settings`.
- Hindsight is the agent's semantic/graph/temporal long-term memory. It is not a replacement for the auditable case database.
- Redis is disposable. The file driver is for local demo and CI only.
- Shared Hindsight bank isolation is per LISA deployment. Do not use one bank across unrelated customers/tenants without adding authenticated tenant scoping and bank/tag isolation.

## Safety boundaries

- Input payloads are bounded and Zod-validated.
- All SQL values are parameterized; identifiers are resolved through static schema specs.
- Provider keys are read only on the server and are never returned by health/settings endpoints.
- Writes check same-origin `Origin` where present; cookie auth is HTTP-only, SameSite Strict and signed.
- Error responses in production hide unhandled exception messages. Structured server logs include request IDs.
- Recommendations remain advisory; there are no side-effecting refund/order/customer contact integrations.
- Memory is evidence, not ground truth. Operators supply outcomes; failure and partial outcomes remain retrievable.

## Deliberate limitations

The first release uses an app-side evidence-weighted action heuristic, not a trained reward model. Local fallback retrieval is lexical rather than semantic. The Postgres table abstraction provides parameterized CRUD and idempotent DDL bootstrap; compound state transitions are currently individual writes, not cross-table ACID transactions. For regulated or high-volume production, add transaction-scoped repository methods, tenant/user roles, audit retention, PII redaction, idempotency keys, background jobs, provider circuit breakers and migration versioning before connecting real customer systems.
