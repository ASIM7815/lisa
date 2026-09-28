import { apiRoute } from "@/lib/api/http";
import { config } from "@/lib/config/env";
import { isAuthenticated } from "@/lib/auth";

export const GET = apiRoute(async (request) => ({
  authenticationRequired: Boolean(config.app.apiToken),
  authenticated: isAuthenticated(request),
}), { public: true, rateLimited: false });
