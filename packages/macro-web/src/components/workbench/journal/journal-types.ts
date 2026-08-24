import type { useI18n } from "../../../lib/macro-i18n-provider";

export type I18nFn = ReturnType<typeof useI18n>["t"];

export type StatusFilter = "all" | "committed" | "reversed" | "failed";
export type TimeFilter = "all" | "today" | "last24h" | "last7d" | "custom";
export type DensityMode = "compact" | "detailed";
export type SortDirection = "desc" | "asc";
