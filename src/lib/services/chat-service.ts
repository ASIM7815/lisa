import { config } from "@/lib/config/env";
import { tables } from "@/lib/db";
import type { ChatTurn, MemoryMatch } from "@/lib/domain/types";
import { groq } from "@/lib/llm/groq";
import { hindsight } from "@/lib/memory/hindsight";
import { recallEmbedded, retainEmbedded } from "@/lib/memory/embedded";
import { newId, nowIso } from "@/lib/utils/ids";
import { logger } from "@/lib/utils/logger";
import { getDashboardData } from "@/lib/services/analytics-service";
import { getSettings } from "@/lib/services/settings-service";

export async function chatTurn(message: string, sessionId?: string): Promise<ChatTurn> {
  const started = performance.now();
  const session = sessionId ?? newId("session");
  const history = await tables.chatMessages.list({ where: { sessionId: session }, orderBy: "createdAt", order: "asc", limit: 12 });
  const settings = await getSettings();
  let memories: MemoryMatch[] = [];
  try {
    if (!settings.memoryEnabled) {
    } else if (config.hindsight.configured) {
      const recalled = await hindsight.recall({ query: message, budget: "low", maxTokens: 1_400 });
      memories = recalled.results.slice(0, 6);
    } else {
      memories = await recallEmbedded(message, 6);
    }
  } catch (error) {
    logger.warn("chat memory recall failed", { error: error instanceof Error ? error.message : "unknown" });
    memories = await recallEmbedded(message, 6);
  }
  const dashboard = await getDashboardData();
  const system = [
    "You are LISA, the Learning Intelligence & Strategy Agent for business operations.",
    "Be helpful, concise, empathetic and practical. Do not claim you executed an action; recommendations always need a human operator.",
    "Distinguish current database facts from retrieved memories. If there is no supporting memory, say so.",
    "When a user describes a new case, suggest creating it in Cases so LISA can analyze and track the outcome.",
    `Current operations snapshot: ${JSON.stringify({ metrics: dashboard.metrics, topCategories: dashboard.categoryCounts.slice(0, 4) })}`,
    `Retrieved experience memory: ${JSON.stringify(memories.map((item) => ({ text: item.text, score: item.score, type: item.type })))}`,
  ].join("\n\n");

  let reply: string;
  let provider = "LISA rules engine";
  let providerMode: "live" | "local" = "local";
  if (config.groq.configured) {
    try {
      const result = await groq.complete([
        { role: "system", content: system },
        ...history.map((item) => ({ role: item.role, content: item.content })),
        { role: "user", content: message },
      ]);
      reply = result.content;
      provider = "Groq";
      providerMode = "live";
    } catch {
      reply = fallbackReply(message, memories, dashboard.metrics);
    }
  } else {
    reply = fallbackReply(message, memories, dashboard.metrics);
  }

  const timestamp = nowIso();
  await tables.chatMessages.insert({
    id: newId("chat"), sessionId: session, role: "user", content: message, memories: [], createdAt: timestamp,
  });
  await tables.chatMessages.insert({
    id: newId("chat"), sessionId: session, role: "assistant", content: reply, memories, createdAt: nowIso(),
  });
  try {
    if (!settings.memoryEnabled) {
      // Respect the operator's memory preference; do not retain chat content.
    } else if (config.hindsight.configured) {
      await hindsight.retain({
        content: `LISA chat. Operator: ${message}\nLISA: ${reply}`,
        context: `Chat session ${session}`,
        tags: ["lisa", "chat"],
        async: true,
      });
    } else {
      await retainEmbedded({ content: `Operator: ${message}\nLISA: ${reply}`, context: `Chat session ${session}`, tags: ["chat"] });
    }
  } catch (error) {
    logger.warn("chat retain failed", { error: error instanceof Error ? error.message : "unknown" });
  }

  return {
    sessionId: session,
    reply,
    memories,
    provider,
    providerMode,
    latencyMs: Math.round(performance.now() - started),
  };
}

function fallbackReply(message: string, memories: MemoryMatch[], metrics: { openCases: number; successRate: number; awaitingDecision: number }) {
  const text = message.toLowerCase();
  if (/how many|open cases|case load|dashboard|analytics/.test(text)) {
    return `There are **${metrics.openCases} open cases**, with **${metrics.awaitingDecision} awaiting an operator decision**. Across resolved cases, the positive outcome rate is **${Math.round(metrics.successRate * 100)}%**. I can help you review a specific case or spot patterns in the case history.`;
  }
  if (/memory|learn|remember|past case|similar|experience/.test(text)) {
    if (!memories.length) return "I don’t have a matching resolved experience in memory yet. When a case is resolved with its outcome, I’ll retain the decision and result so it can inform future recommendations.";
    return `I found **${memories.length} relevant memory item${memories.length === 1 ? "" : "s"}**. The closest experience: “${memories[0].text.slice(0, 280)}”. I use outcomes from resolved cases to adjust future recommendations; a human still approves every action.`;
  }
  return "I’m LISA, your operations copilot. I can analyze customer complaints, delivery failures, refund requests, supplier issues and incidents using resolved case history. Describe what’s happening, or create a case and I’ll show the recommendation, supporting precedents and the outcome learning loop. A live Groq key enables full conversational reasoning; this local response keeps the demo usable without credentials.";
}
