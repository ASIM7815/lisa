import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config/env";
import { UnauthorizedError } from "@/lib/utils/errors";

const COOKIE_NAME = "lisa_session";
const COOKIE_TTL_SECONDS = 60 * 60 * 12;

function signature(payload: string): string {
  // In a configured production deployment, API token is the stable signing
  // secret; local unsigned mode does not create or need a session cookie.
  return createHmac("sha256", config.app.apiToken).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function createSessionCookie(): { name: string; value: string; maxAge: number } {
  const expires = Math.floor(Date.now() / 1_000) + COOKIE_TTL_SECONDS;
  const payload = `${expires}`;
  return { name: COOKIE_NAME, value: `${payload}.${signature(payload)}`, maxAge: COOKIE_TTL_SECONDS };
}

export function clearSessionCookie() {
  return { name: COOKIE_NAME, value: "", maxAge: 0 };
}

export function isAuthenticated(request: Request): boolean {
  if (!config.app.apiToken) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && safeEqual(authHeader.slice(7), config.app.apiToken)) return true;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return false;
  const value = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  const [expires, providedSignature] = value.split(".");
  if (!expires || !providedSignature || Number(expires) < Math.floor(Date.now() / 1_000)) return false;
  return safeEqual(providedSignature, signature(expires));
}

export function assertAuthenticated(request: Request): void {
  if (!isAuthenticated(request)) throw new UnauthorizedError("Sign in to access LISA");
}

export function verifyApiToken(candidate: unknown): boolean {
  return typeof candidate === "string" && config.app.apiToken.length > 0 && safeEqual(candidate, config.app.apiToken);
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}
