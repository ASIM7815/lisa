import { NextResponse } from "next/server";
import { createSessionCookie, sessionCookieOptions, verifyApiToken } from "@/lib/auth";
import { apiRoute, readJson } from "@/lib/api/http";
import { config } from "@/lib/config/env";
import { UnauthorizedError } from "@/lib/utils/errors";

export const POST = apiRoute(async (request) => {
  if (!config.app.apiToken) return { authenticated: true, authenticationRequired: false };
  const body = await readJson<{ token?: unknown }>(request);
  if (!verifyApiToken(body?.token)) throw new UnauthorizedError("Invalid access token");
  const cookie = createSessionCookie();
  const response = NextResponse.json({ authenticated: true, authenticationRequired: true });
  response.cookies.set(cookie.name, cookie.value, sessionCookieOptions(cookie.maxAge));
  return response;
}, { public: true, write: true });
