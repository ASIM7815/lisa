/** Groq chat-completions adapter (OpenAI-compatible REST, server-side only). */
import { config } from "@/lib/config/env";
import { UpstreamError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmResult<T = string> {
  data: T;
  model: string;
  latencyMs: number;
  tokens: { prompt: number; completion: number; total: number };
}

export class GroqClient {
  get configured(): boolean {
    return config.groq.configured;
  }

  get model(): string {
    return config.groq.model;
  }

  async complete(
    messages: LlmMessage[],
    options: { model?: string; temperature?: number; maxTokens?: number; jsonMode?: boolean } = {},
  ) {
    if (!this.configured) throw new Error("GROQ_API_KEY is not configured");
    const started = performance.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= config.groq.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.groq.timeoutMs);
      try {
        const response = await fetch(`${config.groq.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.groq.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model ?? config.groq.model,
            messages,
            temperature: options.temperature ?? 0.25,
            max_tokens: options.maxTokens ?? 1_400,
            stream: false,
            ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          // Avoid logging provider response bodies because gateways can echo prompts.
          await response.text().catch(() => "");
          logger.warn("groq request failed", { status: response.status, attempt: attempt + 1 });
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < config.groq.maxRetries) {
            await delay(Math.min(250 * 2 ** attempt, 1_500));
            continue;
          }
          throw new UpstreamError(`Groq request failed (${response.status})`, { status: response.status });
        }
        const body = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
          model?: string;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        const content = body.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) throw new UpstreamError("Groq returned an empty response");
        const usage = body.usage;
        return {
          content: content.trim(),
          model: body.model ?? options.model ?? config.groq.model,
          latencyMs: Math.round(performance.now() - started),
          tokens: {
            prompt: usage?.prompt_tokens ?? 0,
            completion: usage?.completion_tokens ?? 0,
            total: usage?.total_tokens ?? 0,
          },
        };
      } catch (error) {
        if (error instanceof UpstreamError) throw error;
        lastError = error;
        if (attempt < config.groq.maxRetries) {
          logger.warn("groq network error; retrying", { attempt: attempt + 1 });
          await delay(Math.min(250 * 2 ** attempt, 1_500));
          continue;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new UpstreamError(`Groq request timed out after ${config.groq.timeoutMs}ms`);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new UpstreamError("Unable to reach Groq", {
      reason: lastError instanceof Error ? lastError.message : "unknown network error",
    });
  }

  async completeJson<T>(messages: LlmMessage[], options: { model?: string; maxTokens?: number } = {}): Promise<LlmResult<T>> {
    const result = await this.complete(
      [
        {
          role: "system",
          content:
            "Return exactly one valid JSON object. Do not wrap it in Markdown fences. Do not include commentary outside the JSON.",
        },
        ...messages,
      ],
      { ...options, temperature: 0.15, jsonMode: true },
    );
    try {
      const cleaned = result.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const data = JSON.parse(cleaned) as T;
      return { data, model: result.model, latencyMs: result.latencyMs, tokens: result.tokens };
    } catch {
      throw new UpstreamError("Groq returned invalid JSON", { model: result.model });
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const groq = new GroqClient();
