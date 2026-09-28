import { tables } from "@/lib/db";
import type { BusinessCase, CaseAnalysis, DecisionRecord, Lesson, TimelineEvent } from "@/lib/domain/types";
import { newId } from "@/lib/utils/ids";
import { retainEmbedded } from "@/lib/memory/embedded";

/** Small, deterministic experience set for a one-minute product demo. */
const DEMO_CASES = [
  {
    ref: "CS-DEMO-001",
    title: "Parcel marked delivered but customer never received it",
    description: "A repeat customer says the package was marked delivered yesterday, but no parcel is at their address or with neighbours. The item is needed for a birthday this weekend.",
    category: "delivery_failure",
    priority: "high",
    status: "resolved",
    outcome: "success",
    outcomeNote: "Priority reship arrived the next morning. Customer confirmed receipt and kept the original order; carrier later recovered the first parcel.",
    action: "Priority reship with tracking",
    actionCategory: "reship",
    decision: "approve",
    lesson: "For a missing parcel with a time-sensitive need, priority reship with tracking restored customer trust faster than a refund.",
  },
  {
    ref: "CS-DEMO-002",
    title: "Second delivery delay this month — refund request",
    description: "Customer has experienced a second late delivery in one month. They are frustrated and request a full refund for the order. Tracking shows the parcel is now out for delivery.",
    category: "refund_request",
    priority: "high",
    status: "resolved",
    outcome: "success",
    outcomeNote: "A full shipping refund and a personal apology resolved the issue. The customer kept the order and remained active.",
    action: "Refund delivery charge and personally apologise",
    actionCategory: "refund_partial",
    decision: "modify",
    lesson: "For repeat delivery delays where the order is still arriving, refunding the delivery charge plus a personal apology achieved a good outcome without refunding the product.",
  },
  {
    ref: "CS-DEMO-003",
    title: "Full order refund after first missed delivery",
    description: "Customer's first order was delayed by one day. The agent issued a full refund before confirming that the order was still in transit.",
    category: "delivery_failure",
    priority: "medium",
    status: "resolved",
    outcome: "failure",
    outcomeNote: "The customer received both the full refund and the order, then repeated the tactic on a second order. The team lost revenue and created a policy precedent.",
    action: "Full refund before confirming delivery status",
    actionCategory: "refund_full",
    decision: "approve",
    lesson: "For a first delivery delay, do not issue a full product refund before verifying the carrier status; it led to refund abuse and unnecessary loss.",
  },
  {
    ref: "CS-DEMO-004",
    title: "Supplier short-ships 18 units on a critical order",
    description: "Supplier Northstar Components delivered 42 of 60 units. The remaining units are needed for an enterprise customer build next week. This is the second short shipment from this supplier this quarter.",
    category: "supplier_issue",
    priority: "critical",
    status: "resolved",
    outcome: "partial",
    outcomeNote: "Supplier expedited 12 units in 3 days, but the remaining 6 arrived a week late. We sourced 6 units from an alternate vendor at a 9% premium.",
    action: "Supplier escalation plus alternate sourcing",
    actionCategory: "escalate_supplier",
    decision: "approve",
    lesson: "For repeat supplier short-ships on critical orders, escalate and secure alternate inventory in parallel; relying only on the supplier recovery plan left a gap.",
  },
  {
    ref: "CS-DEMO-005",
    title: "Replacement product arrived damaged too",
    description: "A replacement blender arrived with a cracked casing. The first unit was also damaged in transit. Customer has already contacted support twice.",
    category: "customer_complaint",
    priority: "high",
    status: "resolved",
    outcome: "success",
    outcomeNote: "Customer chose a full refund rather than a third shipment. Refund processed same day and customer appreciated being offered a choice.",
    action: "Offer refund or premium replacement; let customer choose",
    actionCategory: "refund_full",
    decision: "modify",
    lesson: "After a second damaged shipment, offer the customer a choice of refund or a different fulfilment method; a third blind reship risks further trust loss.",
  },
  {
    ref: "CS-DEMO-006",
    title: "Checkout outage affecting multiple customers",
    description: "Three customers report checkout errors in the last 15 minutes. Error logs show elevated payment timeout rates after the 14:00 deployment.",
    category: "operational_incident",
    priority: "critical",
    status: "resolved",
    outcome: "success",
    outcomeNote: "Engineering rolled back the deployment within 11 minutes. Checkout recovered; affected customers were emailed and offered a small goodwill credit.",
    action: "Rollback deployment and notify affected customers",
    actionCategory: "engineer_fix",
    decision: "approve",
    lesson: "When errors begin immediately after a deployment, a safe rollback followed by customer notification restored service faster than debugging live.",
  },
  {
    ref: "CS-DEMO-007",
    title: "Customer charged twice for one subscription",
    description: "Customer provides two invoice IDs for what should be one monthly subscription charge. The duplicate charge is confirmed in billing.",
    category: "refund_request",
    priority: "medium",
    status: "resolved",
    outcome: "success",
    outcomeNote: "Duplicate charge was refunded the same day with an apology. Customer confirmed the refund notification and kept the subscription.",
    action: "Refund duplicate charge and verify billing guardrail",
    actionCategory: "refund_full",
    decision: "approve",
    lesson: "For a verified duplicate charge, refund the duplicate promptly and check whether a billing guardrail failed.",
  },
  {
    ref: "CS-DEMO-008",
    title: "Customer threatens social media escalation over lost order",
    description: "Long-standing customer has not received a high-value order. Carrier investigation is open. Customer says they will post publicly if there is no update today.",
    category: "escalation",
    priority: "critical",
    status: "awaiting_decision",
    outcome: null,
    outcomeNote: null,
    action: "Named manager to contact customer today and arrange tracked replacement",
    actionCategory: "escalate_manager",
    decision: null,
    lesson: "",
  },
  {
    ref: "CS-DEMO-009",
    title: "Late delivery: 48 hours overdue with no tracking update",
    description: "Customer's replacement order is 48 hours overdue. Tracking has not updated since the parcel left the regional hub. Customer asks whether another replacement can be sent.",
    category: "delivery_failure",
    priority: "high",
    status: "open",
    outcome: null,
    outcomeNote: null,
    action: "",
    actionCategory: "reship",
    decision: null,
    lesson: "",
  },
];

export async function seedDemoData(options: { force?: boolean } = {}) {
  const existing = await tables.cases.count();
  if (existing > 0 && !options.force) return { seeded: false, count: existing, message: "Data already exists" };
  if (options.force) {
    // Delete dependent rows first. The file driver supports delete-by-id via
    // row iteration; Postgres does too. No destructive reset without force.
    for (const table of [tables.chatMessages, tables.timeline, tables.decisions, tables.analyses, tables.lessons, tables.memoryUnits, tables.cases]) {
      const rows = await table.list({ limit: 20_000 });
      for (const row of rows) await table.delete(String((row as Record<string, unknown>).id));
    }
  }

  const now = Date.now();
  const cases: BusinessCase[] = [];
  const analyses: CaseAnalysis[] = [];
  const decisions: DecisionRecord[] = [];
  const lessons: Lesson[] = [];
  const timelines: TimelineEvent[] = [];

  for (let index = 0; index < DEMO_CASES.length; index++) {
    const sample = DEMO_CASES[index];
    const id = newId("case");
    const createdAt = new Date(now - (DEMO_CASES.length - index) * 1.65 * 3_600_000).toISOString();
    const resolvedAt = sample.status === "resolved" ? new Date(new Date(createdAt).getTime() + 1.2 * 3_600_000).toISOString() : null;
    const record: BusinessCase = {
      id,
      ref: sample.ref,
      title: sample.title,
      description: sample.description,
      category: sample.category as BusinessCase["category"],
      priority: sample.priority as BusinessCase["priority"],
      status: sample.status as BusinessCase["status"],
      customer: { name: ["Morgan Chen", "Taylor Brooks", "Avery Patel", "Riley Morgan", "Jordan Lee", "Casey Rivera", "Alex Kim", "Sam Carter", "Jamie Wilson"][index], email: `customer${index + 1}@example.com`, channel: index % 2 ? "email" : "web_form", orderId: `ORD-${24000 + index}` },
      metadata: { demo: true },
      source: "demo",
      outcome: sample.outcome as BusinessCase["outcome"],
      outcomeNote: sample.outcomeNote,
      resolutionNote: sample.outcome ? sample.action : null,
      createdAt,
      updatedAt: resolvedAt ?? createdAt,
      resolvedAt,
    };
    cases.push(record);
    timelines.push({
      id: newId("evt"), caseId: id, type: "created", title: "Case created", detail: "Imported from LISA demo dataset.", actor: "Demo", payload: {}, createdAt,
    });
    if (sample.outcome) {
      const action: CaseAnalysis["recommendation"] = {
        action: sample.action,
        actionCategory: sample.actionCategory as CaseAnalysis["recommendation"]["actionCategory"],
        confidence: 0.84,
        rationale: "Based on the case details and relevant prior experience.",
        steps: ["Verify details", "Contact the customer", "Record the outcome"],
      };
      const analysisId = newId("analysis");
      analyses.push({
        id: analysisId,
        caseId: id,
        provider: "LISA demo",
        providerMode: "local",
        model: "lisa-demo-v1",
        summary: sample.lesson,
        rootCause: "Demo case record; see resolution details for the actual outcome.",
        detectedCategory: record.category,
        detectedPriority: record.priority,
        recommendation: action,
        alternatives: [],
        riskFactors: [],
        memory: {
          query: `${record.category} ${record.title}`, provider: "LISA demo memory", providerMode: "local", matchCount: 0, matches: [], adjustments: [], similarCases: [], reflection: null, latencyMs: 0,
        },
        latencyMs: 80,
        tokens: { prompt: 0, completion: 0, total: 0 },
        createdAt,
      });
      const decisionId = newId("decision");
      decisions.push({
        id: decisionId, caseId: id, analysisId, action: sample.decision as DecisionRecord["action"], operator: "Demo operator", note: "Recorded in the demonstration history.", modifiedRecommendation: null, createdAt: new Date(new Date(createdAt).getTime() + 4 * 60_000).toISOString(),
      });
      timelines.push({
        id: newId("evt"), caseId: id, type: "resolved", title: `Case resolved — ${sample.outcome}`, detail: sample.outcomeNote, actor: "Demo operator", payload: { outcome: sample.outcome }, createdAt: resolvedAt!,
      });
      const lesson: Lesson = {
        id: newId("lesson"), caseId: id, caseRef: record.ref, category: record.category, actionCategory: sample.actionCategory as Lesson["actionCategory"], pattern: `${record.category}: ${record.title}`, lesson: sample.lesson, outcome: sample.outcome as NonNullable<BusinessCase["outcome"]>, weight: sample.outcome === "unknown" ? 0.5 : 1, createdAt: resolvedAt!,
      };
      lessons.push(lesson);
      timelines.push({
        id: newId("evt"), caseId: id, type: "memory_retained", title: "Experience added to LISA's memory", detail: "Decision and verified outcome retained for future cases.", actor: "LISA", payload: { demo: true }, createdAt: new Date(new Date(resolvedAt!).getTime() + 2_000).toISOString(),
      });
    }
  }

  for (const record of cases) await tables.cases.insert(record);
  for (const analysis of analyses) await tables.analyses.insert(analysis);
  for (const decision of decisions) await tables.decisions.insert(decision);
  for (const lesson of lessons) await tables.lessons.insert(lesson);
  for (const event of timelines) await tables.timeline.insert(event);

  for (const lesson of lessons) {
    const record = cases.find((item) => item.id === lesson.caseId)!;
    const action = analyses.find((item) => item.caseId === record.id)!.recommendation;
    await retainEmbedded({
      content: `Resolved business case ${record.ref} (${record.category.replace(/_/g, " ")}). Issue: ${record.title}. ${record.description} Action taken: ${action.action}. Outcome: ${record.outcome}. ${record.outcomeNote} Lesson: ${lesson.lesson}`,
      context: `Resolved case ${record.ref}`,
      tags: [record.category, record.outcome ?? "unknown", action.actionCategory],
      metadata: { category: record.category, outcome: record.outcome, caseRef: record.ref, action_category: action.actionCategory },
      sourceCaseId: record.id,
      outcome: record.outcome ?? "unknown",
      decision: decisions.find((item) => item.caseId === record.id)?.action,
      actionCategory: action.actionCategory,
      occurredAt: record.resolvedAt ?? record.createdAt,
    });
  }

  return { seeded: true, count: cases.length, resolved: lessons.length, open: cases.length - lessons.length, message: "Demo experience seeded" };
}
