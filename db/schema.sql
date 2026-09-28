CREATE TABLE IF NOT EXISTS "cases" (
  "id" text PRIMARY KEY,
  "ref" text UNIQUE NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "category" text NOT NULL,
  "priority" text NOT NULL,
  "status" text NOT NULL,
  "customer" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source" text NOT NULL DEFAULT 'manual',
  "outcome" text,
  "outcome_note" text,
  "resolution_note" text,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "resolved_at" timestamptz
);

CREATE INDEX IF NOT EXISTS cases_status_idx ON cases (status);

CREATE INDEX IF NOT EXISTS cases_category_idx ON cases (category);

CREATE INDEX IF NOT EXISTS cases_created_at_idx ON cases (created_at DESC);

CREATE TABLE IF NOT EXISTS "analyses" (
  "id" text PRIMARY KEY,
  "case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "provider_mode" text NOT NULL,
  "model" text NOT NULL,
  "summary" text NOT NULL,
  "root_cause" text NOT NULL,
  "detected_category" text NOT NULL,
  "detected_priority" text NOT NULL,
  "recommendation" jsonb NOT NULL,
  "alternatives" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "risk_factors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "memory" jsonb NOT NULL,
  "latency_ms" integer NOT NULL DEFAULT 0,
  "tokens" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz
);

CREATE INDEX IF NOT EXISTS analyses_case_id_idx ON analyses (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "decisions" (
  "id" text PRIMARY KEY,
  "case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "analysis_id" text REFERENCES "analyses"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "operator" text NOT NULL DEFAULT 'operator',
  "note" text,
  "modified_recommendation" jsonb,
  "created_at" timestamptz
);

CREATE INDEX IF NOT EXISTS decisions_case_id_idx ON decisions (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS decisions_action_idx ON decisions (action);

CREATE TABLE IF NOT EXISTS "timeline" (
  "id" text PRIMARY KEY,
  "case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "detail" text,
  "actor" text NOT NULL DEFAULT 'system',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz
);

CREATE INDEX IF NOT EXISTS timeline_case_id_idx ON timeline (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "lessons" (
  "id" text PRIMARY KEY,
  "case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "case_ref" text NOT NULL,
  "category" text NOT NULL,
  "action_category" text NOT NULL,
  "pattern" text NOT NULL,
  "lesson" text NOT NULL,
  "outcome" text NOT NULL,
  "weight" double precision NOT NULL DEFAULT 1,
  "created_at" timestamptz
);

CREATE INDEX IF NOT EXISTS lessons_category_idx ON lessons (category, action_category);

CREATE TABLE IF NOT EXISTS "memory_units" (
  "id" text PRIMARY KEY,
  "bank" text NOT NULL DEFAULT 'lisa-operations',
  "content" text NOT NULL,
  "context" text,
  "type" text NOT NULL DEFAULT 'experience',
  "tags" text[] NOT NULL DEFAULT '{}',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_case_id" text REFERENCES "cases"("id") ON DELETE SET NULL,
  "outcome" text,
  "decision" text,
  "action_category" text,
  "occurred_at" timestamptz,
  "created_at" timestamptz
);

CREATE INDEX IF NOT EXISTS memory_units_bank_idx ON memory_units (bank);

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" text PRIMARY KEY,
  "session_id" text NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "memories" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz
);

CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updated_at" timestamptz
);
