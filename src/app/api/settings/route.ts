import { apiRoute, parseOrThrow, readJson } from "@/lib/api/http";
import { getSettings, getSystemStatus, updateSettings } from "@/lib/services/settings-service";
import { settingsUpdateSchema } from "@/lib/validation/schemas";

export const GET = apiRoute(async () => {
  const [settings, system] = await Promise.all([getSettings(), getSystemStatus()]);
  return { settings, system };
});

export const PATCH = apiRoute(async (request) => {
  const patch = parseOrThrow(settingsUpdateSchema, await readJson(request));
  return { settings: await updateSettings(patch) };
}, { write: true });
