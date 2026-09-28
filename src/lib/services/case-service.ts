import { tables } from "@/lib/db";
import type { BusinessCase, CaseAnalysis, CaseStatus, TimelineEvent } from "@/lib/domain/types";
import { randomBytes } from "node:crypto";
import { newId, nowIso } from "@/lib/utils/ids";
import { BadRequestError, NotFoundError } from "@/lib/utils/errors";
import type { CreateCaseInput } from "@/lib/validation/schemas";
import { caseListQuerySchema } from "@/lib/validation/schemas";

export async function nextCaseRef(): Promise<string> {
  // Random suffix avoids the read/increment/write race across horizontally
  // scaled instances. The unique DB constraint is the final guardrail.
  const year = new Date().getUTCFullYear();
  return `CS-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function addTimeline(
  caseId: string,
  type: TimelineEvent["type"],
  title: string,
  detail: string | null = null,
  actor = "LISA",
  payload: Record<string, unknown> = {},
): Promise<TimelineEvent> {
  return tables.timeline.insert({
    id: newId("evt"),
    caseId,
    type,
    title,
    detail,
    actor,
    payload,
    createdAt: nowIso(),
  });
}

export async function createCase(input: CreateCaseInput, actor = "Operator"): Promise<BusinessCase> {
  const timestamp = nowIso();
  const record: BusinessCase = {
    id: newId("case"),
    ref: await nextCaseRef(),
    title: input.title,
    description: input.description,
    category: input.category,
    priority: input.priority,
    status: "open",
    customer: input.customer,
    metadata: input.metadata,
    source: input.source,
    outcome: null,
    outcomeNote: null,
    resolutionNote: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    resolvedAt: null,
  };
  await tables.cases.insert(record);
  await addTimeline(record.id, "created", "Case created", `Created via ${record.source}.`, actor, {
    category: record.category,
    priority: record.priority,
    source: record.source,
  });
  return record;
}

const STATUSES = ["open", "analyzing", "awaiting_decision", "in_progress", "resolved", "dismissed"] as const;
const CATEGORIES = [
  "customer_complaint", "delivery_failure", "refund_request", "supplier_issue", "operational_incident", "escalation", "other",
] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export async function listCases(rawQuery: Record<string, string | string[] | undefined> = {}) {
  const parsed = caseListQuerySchema.safeParse({
    status: first(rawQuery.status),
    category: first(rawQuery.category),
    priority: first(rawQuery.priority),
    q: first(rawQuery.q),
    limit: first(rawQuery.limit),
    offset: first(rawQuery.offset),
    sort: first(rawQuery.sort),
    order: first(rawQuery.order),
  });
  if (!parsed.success) throw new BadRequestError("Invalid case filters", parsed.error.flatten());
  const query = parsed.data;
  if (query.status && query.status !== "all" && !STATUSES.includes(query.status as (typeof STATUSES)[number])) {
    throw new BadRequestError(`Invalid status filter: ${query.status}`);
  }
  if (query.category && query.category !== "all" && !CATEGORIES.includes(query.category as (typeof CATEGORIES)[number])) {
    throw new BadRequestError(`Invalid category filter: ${query.category}`);
  }
  if (query.priority && query.priority !== "all" && !PRIORITIES.includes(query.priority as (typeof PRIORITIES)[number])) {
    throw new BadRequestError(`Invalid priority filter: ${query.priority}`);
  }
  const where: Record<string, unknown> = {};
  if (query.status && query.status !== "all") where.status = query.status;
  if (query.category && query.category !== "all") where.category = query.category;
  if (query.priority && query.priority !== "all") where.priority = query.priority;
  if (query.q) {
    where.$or = [
      { ref: { $ilike: `%${query.q}%` } },
      { title: { $ilike: `%${query.q}%` } },
      { description: { $ilike: `%${query.q}%` } },
      { customer: { $ilike: `%${query.q}%` } },
    ];
  }
  const matcher = where as import("@/lib/db/query").Where;
  const [items, total] = await Promise.all([
    tables.cases.list({ where: matcher, orderBy: query.sort, order: query.order, limit: query.limit, offset: query.offset }),
    tables.cases.count(matcher),
  ]);
  return { cases: items, total, limit: query.limit, offset: query.offset };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function getCase(caseId: string): Promise<BusinessCase> {
  const record = await tables.cases.get(caseId);
  if (!record) throw new NotFoundError(`Case ${caseId} not found`);
  return record;
}

export async function getCaseAnalysis(caseId: string): Promise<CaseAnalysis | null> {
  const rows = await tables.analyses.list({ where: { caseId }, orderBy: "createdAt", order: "desc", limit: 1 });
  return rows[0] ?? null;
}

export async function getCaseDetails(caseId: string) {
  const record = await getCase(caseId);
  const [analysis, decisions, timeline] = await Promise.all([
    getCaseAnalysis(caseId),
    tables.decisions.list({ where: { caseId }, orderBy: "createdAt", order: "asc" }),
    tables.timeline.list({ where: { caseId }, orderBy: "createdAt", order: "asc" }),
  ]);
  return { case: record, analysis, decisions, timeline };
}

export async function updateCase(caseId: string, patch: Partial<BusinessCase>): Promise<BusinessCase> {
  const current = await getCase(caseId);
  const updated = await tables.cases.update(caseId, { ...patch, updatedAt: nowIso() });
  if (!updated) throw new NotFoundError(`Case ${caseId} not found`);
  await addTimeline(caseId, "note", "Case updated", "Case details were updated.", "Operator", {
    fields: Object.keys(patch).filter((key) => key !== "updatedAt"),
  });
  return { ...current, ...updated };
}

export async function setCaseStatus(caseId: string, status: CaseStatus): Promise<BusinessCase> {
  const updated = await tables.cases.update(caseId, { status, updatedAt: nowIso() });
  if (!updated) throw new NotFoundError(`Case ${caseId} not found`);
  return updated;
}

export async function listDashboardCases(limit = 8): Promise<BusinessCase[]> {
  return tables.cases.list({ orderBy: "createdAt", order: "desc", limit });
}
