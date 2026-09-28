import { apiRoute, parseOrThrow, readJson } from "@/lib/api/http";
import { chatTurn } from "@/lib/services/chat-service";
import { chatSchema } from "@/lib/validation/schemas";
import { tables } from "@/lib/db";

export const GET = apiRoute(async (request) => {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId || sessionId.length > 120) return { messages: [] };
  const messages = await tables.chatMessages.list({ where: { sessionId }, orderBy: "createdAt", order: "asc", limit: 100 });
  return { messages };
});

export const POST = apiRoute(async (request) => {
  const body = parseOrThrow(chatSchema, await readJson(request));
  return { turn: await chatTurn(body.message, body.sessionId) };
}, { write: true });
