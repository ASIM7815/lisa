import { tables } from "@/lib/db";
import type {
  ActionCategory,
  BusinessCase,
  CaseAnalysis,
  DecisionRecord,
  Lesson,
  RecommendedAction,
} from "@/lib/domain/types";
import { addTimeline, getCase, getCaseAnalysis, setCaseStatus } from "@/lib/services/case-service";
import { retainResolvedExperience } from "@/lib/services/memory-service";
import { getSettings } from "@/lib/services/settings-service";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/utils/errors";
import { newId, nowIso } from "@/lib/utils/ids";
import type { DecisionAction, Outcome } from "@/lib/domain/types";

export async function recordDecision(
  caseId: string,
  input: {
    action: DecisionAction;
    operator: string;
    note?: string;
    modifiedRecommendation?: RecommendedAction;
  },
): Promise<DecisionRecord> {
  const record = await getCase(caseId);
  if (record.status === "resolved" || record.status === "dismissed") {
    throw new ConflictError("A resolved or dismissed case cannot receive a new decision");
  }
  const analysis = await getCaseAnalysis(caseId);
  if (!analysis && input.action !== "reject") throw new BadRequestError("Analyze the case before recording this decision");
  if (input.action === "modify" && !input.modifiedRecommendation) {
    throw new BadRequestError("A modified recommendation is required");
  }

  const decision: DecisionRecord = {
    id: newId("decision"),
    caseId,
    analysisId: analysis?.id ?? null,
    action: input.action,
    operator: input.operator,
    note: input.note?.trim() || null,
    modifiedRecommendation: input.action === "modify" ? input.modifiedRecommendation ?? null : null,
    createdAt: nowIso(),
  };
  await tables.decisions.insert(decision);
  const nextStatus = input.action === "reject" ? "open" : "in_progress";
  await setCaseStatus(caseId, nextStatus);
  await addTimeline(
    caseId,
    "decision",
    decisionTitle(input.action),
    input.note?.trim() || decisionDetail(input.action, analysis, decision.modifiedRecommendation),
    input.operator,
    {
      decisionId: decision.id,
      action: input.action,
      analysisId: analysis?.id ?? null,
      modifiedRecommendation: decision.modifiedRecommendation,
    },
  );
  return decision;
}

function decisionTitle(action: DecisionAction): string {
  return {
    approve: "Recommendation approved",
    reject: "Recommendation rejected",
    modify: "Recommendation modified",
    resolve: "Case marked for resolution",
  }[action];
}

function decisionDetail(
  action: DecisionAction,
  analysis: CaseAnalysis | null,
  modified: RecommendedAction | null,
): string {
  if (action === "approve") return `Approved: ${analysis?.recommendation.action ?? "recommendation"}.`;
  if (action === "modify") return `Modified to: ${modified?.action ?? "custom action"}.`;
  if (action === "reject") return "The suggested recommendation was rejected. LISA will not execute any action.";
  return "Operator proceeded to resolve the case.";
}

export async function resolveCase(
  caseId: string,
  input: { outcome: Outcome; outcomeNote: string; resolutionNote?: string; operator: string },
) {
  const record = await getCase(caseId);
  if (record.status === "resolved") throw new ConflictError("This case is already resolved");
  if (record.status === "dismissed") throw new ConflictError("Dismissed cases cannot be resolved");
  const analysis = await getCaseAnalysis(caseId);
  const decisions = await tables.decisions.list({ where: { caseId }, orderBy: "createdAt", order: "desc", limit: 1 });
  const decision = decisions[0] ?? null;

  // Prefer operator-modified action; otherwise the approved LISA recommendation.
  const action = decision?.modifiedRecommendation ?? analysis?.recommendation ?? fallbackAction(record);
  const resolvedAt = nowIso();
  const updated = await tables.cases.update(caseId, {
    status: "resolved",
    outcome: input.outcome,
    outcomeNote: input.outcomeNote.trim(),
    resolutionNote: input.resolutionNote?.trim() || null,
    resolvedAt,
    updatedAt: resolvedAt,
  });
  if (!updated) throw new NotFoundError(`Case ${caseId} not found`);

  await addTimeline(caseId, "resolved", `Case resolved — ${input.outcome}`, input.outcomeNote.trim(), input.operator, {
    outcome: input.outcome,
    outcomeNote: input.outcomeNote.trim(),
    resolutionNote: input.resolutionNote?.trim() || null,
  });

  const lessonText = buildLesson(record, action, input.outcome, input.outcomeNote);
  const lesson: Lesson = {
    id: newId("lesson"),
    caseId,
    caseRef: record.ref,
    category: record.category,
    actionCategory: action.actionCategory,
    pattern: `${record.category}: ${record.title}`,
    lesson: lessonText,
    outcome: input.outcome,
    weight: input.outcome === "unknown" ? 0.5 : 1,
    createdAt: resolvedAt,
  };
  await tables.lessons.insert(lesson);

  let retained = false;
  let memoryError: string | undefined;
  const settings = await getSettings();
  try {
    if (!settings.memoryEnabled) throw new Error("Memory is disabled by workspace settings");
    await retainResolvedExperience({
      caseRecord: { ...record, ...updated },
      decision: decision?.action ?? null,
      actionCategory: action.actionCategory,
      action: action.action,
      outcome: input.outcome,
      outcomeNote: input.outcomeNote.trim(),
      lesson: lessonText,
    });
    retained = true;
  } catch (error) {
    // Resolution remains committed; expose a warning and let operators retry
    // memory retention through a future admin action rather than rollback.
    memoryError = error instanceof Error ? error.message : "Memory retain failed";
  }
  await addTimeline(
    caseId,
    "memory_retained",
    retained ? "Experience added to LISA's memory" : "Experience recorded locally",
    retained
      ? "The decision and its real outcome are now available to inform future recommendations."
      : "The case is resolved, but the memory provider could not confirm the write.",
    "LISA",
    { retained, provider: retained ? "memory-service" : "local", memoryError },
  );

  return { case: updated, lesson, memoryRetained: retained, memoryError };
}

function buildLesson(record: BusinessCase, action: RecommendedAction, outcome: Outcome, note: string): string {
  if (outcome === "success") {
    return `For ${record.category.replace(/_/g, " ")} cases like “${record.title}”, ${action.actionCategory} worked: ${note.trim()}`;
  }
  if (outcome === "failure") {
    return `For ${record.category.replace(/_/g, " ")} cases like “${record.title}”, be cautious with ${action.actionCategory}: ${note.trim()}`;
  }
  if (outcome === "partial") {
    return `For ${record.category.replace(/_/g, " ")} cases like “${record.title}”, ${action.actionCategory} had a mixed result: ${note.trim()}`;
  }
  return `For ${record.category.replace(/_/g, " ")} cases like “${record.title}”, the outcome of ${action.actionCategory} is not yet known: ${note.trim()}`;
}

function fallbackAction(record: BusinessCase): RecommendedAction {
  const actionCategory: ActionCategory = record.category === "delivery_failure" ? "reship" : "contact_customer";
  return {
    action: actionCategory === "reship" ? "Arrange a priority reshipment" : "Contact the customer and agree a resolution",
    actionCategory,
    confidence: 0.5,
    rationale: "Fallback used because no analysis was stored.",
    steps: ["Verify case details", "Agree next step with the customer"],
  };
}
