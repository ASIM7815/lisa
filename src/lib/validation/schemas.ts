import { z } from "zod";
import {
  ACTION_CATEGORIES,
  CASE_CATEGORIES,
  DECISION_ACTIONS,
  OUTCOMES,
  PRIORITIES,
} from "@/lib/domain/types";

const boundedString = (max: number) => z.string().trim().max(max);

export const createCaseSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().trim().min(10, "Add a little more detail (at least 10 characters)").max(12_000),
  category: z.enum(CASE_CATEGORIES).default("other"),
  priority: z.enum(PRIORITIES).default("medium"),
  customer: z
    .object({
      name: boundedString(160).optional(),
      email: z.email().max(254).optional().or(z.literal("")),
      channel: boundedString(80).optional(),
      accountId: boundedString(120).optional(),
      orderId: boundedString(120).optional(),
    })
    .default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  source: boundedString(80).default("manual"),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().min(10).max(12_000).optional(),
    category: z.enum(CASE_CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(["open", "awaiting_decision", "in_progress", "dismissed"] as const).optional(),
    customer: createCaseSchema.shape.customer.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const caseListQuerySchema = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  priority: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  sort: z.enum(["createdAt", "updatedAt", "priority", "status"] as const).default("createdAt"),
  order: z.enum(["asc", "desc"] as const).default("desc"),
});

export const decisionSchema = z
  .object({
    action: z.enum(DECISION_ACTIONS),
    operator: z.string().trim().min(1).max(120).default("Operator"),
    note: boundedString(4_000).optional(),
    modifiedRecommendation: z
      .object({
        action: z.string().trim().min(5).max(1_000),
        actionCategory: z.enum(ACTION_CATEGORIES),
        confidence: z.number().min(0).max(1),
        rationale: z.string().trim().max(4_000),
        steps: z.array(z.string().trim().min(1).max(500)).max(12),
        slaHours: z.number().int().positive().max(8760).optional(),
        estimatedCost: boundedString(160).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "modify" && !data.modifiedRecommendation) {
      ctx.addIssue({ code: "custom", message: "A modified recommendation is required", path: ["modifiedRecommendation"] });
    }
  });

export const resolveCaseSchema = z.object({
  outcome: z.enum(OUTCOMES),
  outcomeNote: z.string().trim().min(3).max(4_000),
  resolutionNote: boundedString(4_000).optional(),
  operator: z.string().trim().min(1).max(120).default("Operator"),
});

export const analyzeSchema = z.object({
  force: z.boolean().default(false),
});

export const chatSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  sessionId: z.string().trim().min(1).max(120).optional(),
});

export const settingsUpdateSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  businessName: boundedString(120).optional(),
  operatorName: boundedString(120).optional(),
  slaHours: z.record(z.string(), z.number().int().positive().max(8760)).optional(),
  autoAnalyze: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
});

export const importCasesSchema = z.object({
  cases: z.array(createCaseSchema).min(1).max(100),
  source: boundedString(80).default("import"),
});

export const seedDemoSchema = z.object({
  scenario: z.enum(["delivery", "refund", "supplier", "all"]).default("all"),
});

export const learnDemoSchema = z.object({
  scenario: z.enum(["delivery", "refund", "supplier", "all"]).default("all"),
});
