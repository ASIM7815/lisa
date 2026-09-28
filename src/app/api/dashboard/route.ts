import { apiRoute } from "@/lib/api/http";
import { getDashboardData } from "@/lib/services/analytics-service";

export const dynamic = "force-dynamic";
export const GET = apiRoute(async () => getDashboardData());
