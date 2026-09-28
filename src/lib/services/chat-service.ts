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
    "",
    "RESPONSE STYLE:",
    "• Keep responses SHORT and CLEAR (2-4 sentences for simple questions)",
    "• Use simple bullet points, not tables or complex formatting",
    "• Be direct and practical, skip unnecessary context",
    "• Use everyday language, not corporate jargon",
    "• When showing data, present it simply: 'We have 12 cases. 9 are resolved (88% success rate).'",
    "",
    "IMPORTANT RULES:",
    "• Never use tables, complex markdown, or emojis in lists",
    "• Don't explain what LISA is unless specifically asked",
    "• Give specific actionable answers, not general advice",
    "• If showing patterns, list 2-3 key points maximum",
    "• Don't claim you executed actions - you only recommend",
    "",
    "WHEN ASKED ABOUT PATTERNS/PROBLEMS:",
    "Format: 'I see [number] main issues: 1) [issue] - [what works], 2) [issue] - [what works]'",
    "Keep it to 3-4 lines total.",
    "",
    `Current operations: ${dashboard.metrics.totalCases} cases total, ${dashboard.metrics.resolvedCases} resolved, ${Math.round(dashboard.metrics.successRate * 100)}% success rate. Top categories: ${dashboard.categoryCounts.slice(0, 3).map(c => c.label).join(", ")}.`,
    memories.length > 0 ? `Retrieved ${memories.length} relevant experiences from memory.` : "",
  ].filter(Boolean).join("\n");

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
    return `You have ${metrics.openCases} open cases. ${metrics.awaitingDecision} need your decision. Success rate: ${Math.round(metrics.successRate * 100)}%.`;
  }
  
  if (/memory|learn|remember|past case|similar|experience|pattern|problem/.test(text)) {
    if (!memories.length) {
      return "No similar cases found yet. Once you resolve cases with outcomes, I'll remember them for future recommendations.";
    }
    return `Found ${memories.length} similar past cases. Most relevant: "${memories[0].text.slice(0, 150)}..." I use these to improve recommendations.`;
  }
  
  if (/what can|help|do/.test(text)) {
    return `I analyze customer issues and recommend actions based on past outcomes. Create a case or ask about patterns. Stats: ${metrics.openCases} open, ${Math.round(metrics.successRate * 100)}% success rate.`;
  }
  
  return "I can analyze cases, show patterns, or answer questions about operations. Try: 'What patterns do you see?' or create a case to analyze.";
}
