/** Domain model shared by the API, the services layer and the UI. */

export const CASE_CATEGORIES = [
  "customer_complaint",
  "delivery_failure",
  "refund_request",
  "supplier_issue",
  "operational_incident",
  "escalation",
  "other",
] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CASE_STATUSES = [
  "open",
  "analyzing",
  "awaiting_decision",
  "in_progress",
  "resolved",
  "dismissed",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** What the human operator did with LISA's recommendation. */
export const DECISION_ACTIONS = ["approve", "reject", "modify", "resolve"] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** What actually happened in the business after the decision. */
export const OUTCOMES = ["success", "partial", "failure", "unknown"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Coarse bucket for the recommended business action — the unit LISA learns over. */
export const ACTION_CATEGORIES = [
  "refund_full",
  "refund_partial",
  "reship",
  "replacement",
  "voucher_goodwill",
  "contact_customer",
  "escalate_manager",
  "escalate_supplier",
  "engineer_fix",
  "process_change",
  "no_action",
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export interface CustomerRef {
  name?: string;
  email?: string;
  /** e.g. email, phone, chat, web_form, partner_api */
  channel?: string;
  /** Free-form account/order identifiers used to link cases. */
  accountId?: string;
  orderId?: string;
}

export interface BusinessCase {
  id: string;
  /** Human-friendly reference, e.g. CS-2026-000123 */
  ref: string;
  title: string;
  description: string;
  category: CaseCategory;
  priority: Priority;
  status: CaseStatus;
  customer: CustomerRef;
  /** Arbitrary source payload (imported ticket JSON, etc.). */
  metadata: Record<string, unknown>;
  source: string;
  outcome: Outcome | null;
  outcomeNote: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface RecommendedAction {
  /** Imperative headline, e.g. "Issue a full refund and reship overnight". */
  action: string;
  actionCategory: ActionCategory;
  /** 0..1 */
  confidence: number;
  rationale: string;
  steps: string[];
  slaHours?: number;
  estimatedCost?: string;
}

/** One memory hit returned by Hindsight (or the local embedded provider). */
export interface MemoryMatch {
  id: string;
  text: string;
  type: "world" | "experience" | "observation";
  /** 0..1 relevance after fusion/reranking. */
  score: number;
  tags: string[];
  entities: string[];
  context?: string;
  sourceCaseId?: string;
  sourceCaseRef?: string;
  outcome?: Outcome;
  decision?: DecisionAction;
  actionCategory?: ActionCategory;
  occurredAt?: string;
  mentionedAt?: string;
}

/** An explicit, auditable way in which past experience changed this answer. */
export interface LearnedAdjustment {
  actionCategory: ActionCategory;
  direction: "boost" | "penalty";
  /** 0..1 */
  magnitude: number;
  evidenceCount: number;
  successRate: number;
  reason: string;
}

export interface AnalysisMemoryTrace {
  query: string;
  provider: string;
  providerMode: "live" | "local";
  matchCount: number;
  matches: MemoryMatch[];
  adjustments: LearnedAdjustment[];
  /** Similar resolved cases surfaced for the "what happened before" panel. */
  similarCases: SimilarCase[];
  reflection: string | null;
  latencyMs: number;
}

export interface SimilarCase {
  caseId: string;
  ref: string;
  title: string;
  category: CaseCategory;
  score: number;
  decision: DecisionAction | null;
  actionCategory: ActionCategory | null;
  outcome: Outcome | null;
  outcomeNote: string | null;
  resolvedAt: string | null;
  takeaway: string | null;
}

export interface CaseAnalysis {
  id: string;
  caseId: string;
  provider: string;
  providerMode: "live" | "local";
  model: string;
  summary: string;
  rootCause: string;
  detectedCategory: CaseCategory;
  detectedPriority: Priority;
  recommendation: RecommendedAction;
  alternatives: RecommendedAction[];
  riskFactors: string[];
  memory: AnalysisMemoryTrace;
  latencyMs: number;
  tokens: { prompt: number; completion: number; total: number };
  createdAt: string;
}

export interface DecisionRecord {
  id: string;
  caseId: string;
  analysisId: string | null;
  action: DecisionAction;
  operator: string;
  note: string | null;
  modifiedRecommendation: RecommendedAction | null;
  createdAt: string;
}

export type TimelineEventType =
  | "created"
  | "analyzed"
  | "recalled"
  | "recommended"
  | "decision"
  | "resolved"
  | "memory_retained"
  | "note";

export interface TimelineEvent {
  id: string;
  caseId: string;
  type: TimelineEventType;
  title: string;
  detail: string | null;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** A distilled lesson written back after resolution — LISA's "textbook". */
export interface Lesson {
  id: string;
  caseId: string;
  caseRef: string;
  category: CaseCategory;
  actionCategory: ActionCategory;
  pattern: string;
  lesson: string;
  outcome: Outcome;
  /** 1 = decisive, decays as contradicting evidence accumulates. */
  weight: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  memories: MemoryMatch[];
  createdAt: string;
}

export interface ChatTurn {
  sessionId: string;
  reply: string;
  memories: MemoryMatch[];
  provider: string;
  providerMode: "live" | "local";
  latencyMs: number;
}

export const CATEGORY_LABELS: Record<CaseCategory, string> = {
  customer_complaint: "Customer complaint",
  delivery_failure: "Delivery failure",
  refund_request: "Refund request",
  supplier_issue: "Supplier issue",
  operational_incident: "Operational incident",
  escalation: "Escalation",
  other: "Other",
};

export const ACTION_LABELS: Record<ActionCategory, string> = {
  refund_full: "Full refund",
  refund_partial: "Partial refund",
  reship: "Reship order",
  replacement: "Send replacement",
  voucher_goodwill: "Goodwill voucher",
  contact_customer: "Contact customer",
  escalate_manager: "Escalate to manager",
  escalate_supplier: "Escalate to supplier",
  engineer_fix: "Engineering fix",
  process_change: "Process change",
  no_action: "No action",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  success: "Success",
  partial: "Partial",
  failure: "Failure",
  unknown: "Unknown",
};
