import { ACTION_LABELS, CATEGORY_LABELS, type ActionCategory, type CaseCategory } from "@/lib/domain/types";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  const units: Array<[number, string]> = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2592000, "month"],
  ];
  let value = seconds;
  let unit = "second";
  for (const [limit, name] of units) {
    if (seconds < limit) break;
    value = Math.round(seconds / limit);
    unit = name;
  }
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

export function categoryLabel(category: CaseCategory | string): string {
  return CATEGORY_LABELS[category as CaseCategory] ?? String(category).replace(/_/g, " ");
}

export function actionLabel(action: ActionCategory | string): string {
  return ACTION_LABELS[action as ActionCategory] ?? String(action).replace(/_/g, " ");
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
