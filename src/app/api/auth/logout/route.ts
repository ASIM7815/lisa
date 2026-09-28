import { NextResponse } from "next/server";
import { clearSessionCookie, sessionCookieOptions } from "@/lib/auth";
import { apiRoute } from "@/lib/api/http";

export const POST = apiRoute(async () => {
  const cookie = clearSessionCookie();
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(cookie.name, cookie.value, sessionCookieOptions(cookie.maxAge));
  return response;
}, { public: true, write: true });
