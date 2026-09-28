import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAuthenticated } from "@/lib/auth";
import { config } from "@/lib/config/env";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { cacheDelete, rateLimit } from "@/lib/cache";
import { AppError, RateLimitError, toErrorPayload } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response | unknown>;

/** Uniform API route wrapper: auth, same-origin CSRF, rate limit, schema and errors. */
export function apiRoute(handler: Handler, options: { public?: boolean; write?: boolean; rateLimited?: boolean } = {}) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const started = performance.now();
    try {
      if (!options.public) assertAuthenticated(request);
      if (options.write) assertSameOrigin(request);
      if (options.rateLimited !== false) {
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const identity = request.headers.get("authorization") ?? request.headers.get("cookie") ?? ip;
        const limit = await rateLimit(`${ip}:${identity.slice(0, 40)}`, config.app.rateLimitPerMinute, 60);
        if (!limit.allowed) throw new RateLimitError();
      }
      await ensureDatabaseReady();
      if (options.write) await cacheDelete("dashboard:v1");
      const result = await handler(request, context);
      if (options.write) await cacheDelete("dashboard:v1");
      const response = result instanceof Response ? result : NextResponse.json(result);
      response.headers.set("x-request-id", requestId);
      response.headers.set("x-response-time", `${Math.round(performance.now() - started)}ms`);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      const payload = toErrorPayload(error);
      if (status >= 500) {
        logger.error("api request failed", {
          requestId,
          method: request.method,
          path: new URL(request.url).pathname,
          status,
          error: error instanceof Error ? error.message : "unknown",
        });
      } else {
        logger.warn("api request rejected", { requestId, method: request.method, status, code: payload.body.error.code });
      }
      const safeBody = !(error instanceof AppError) && config.isProduction
        ? { error: { code: "internal_error", message: "Internal server error" } }
        : payload.body;
      return NextResponse.json({ ...safeBody, requestId }, { status: payload.status, headers: { "x-request-id": requestId, "Cache-Control": "no-store" } });
    }
  };
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return; // server-to-server / CLI clients can omit it
  const url = new URL(request.url);
  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const requestHost = forwardedHost ?? request.headers.get("host") ?? url.host;
    if (new URL(origin).host !== requestHost) throw new AppError("Cross-origin request blocked", 403, "csrf_rejected");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid origin", 403, "csrf_rejected");
  }
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError("Content-Type must be application/json", 415, "unsupported_media_type");
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 1_000_000) throw new AppError("Request body is too large", 413, "payload_too_large");
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Request body must be valid JSON", 400, "invalid_json");
  }
}

export function parseOrThrow<T>(schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: { flatten: () => unknown } } }, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("Request validation failed", 400, "validation_error", parsed.error?.flatten());
  return parsed.data as T;
}
