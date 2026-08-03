import type { TemporalDirection, TimePrecisionLevel } from "../schemas/schemas-interface/time";

export interface V2DateRecognitionRule { pattern: string; precision: TimePrecisionLevel; yearGroup: string; monthGroup: string; dayGroup: string; timeGroup?: string; }
/** Separate from command syntax: controls how temporal text is written/read. */
export interface V2TemporalSyntaxProfile {
	profileId: string;
	dateRecognitionRules: readonly V2DateRecognitionRule[];
	relativeDayAliases: Readonly<Record<string, number>>;
	unitAliases: Readonly<Record<string, TimePrecisionLevel>>;
	directionAliases: Readonly<Record<string, TemporalDirection>>;
	rangeDelimiters: readonly string[];
	boundaryAliases?: Readonly<Record<string, "start" | "end" | "include" | "exclude">>;
}
export const V2_TEMPORAL_SYNTAX_DEFAULTS: V2TemporalSyntaxProfile = {
	profileId: "v2-temporal-default",
	dateRecognitionRules: [{ pattern: "^(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})(?:T(?<time>[^\\s]+))?$", precision: "day", yearGroup: "year", monthGroup: "month", dayGroup: "day", timeGroup: "time" }],
	relativeDayAliases: { today: 0, yesterday: -1, tomorrow: 1 },
	unitAliases: { second: "second", seconds: "second", minute: "minute", minutes: "minute", hour: "hour", hours: "hour", day: "day", days: "day", week: "week", weeks: "week", month: "month", months: "month", year: "year", years: "year" },
	directionAliases: { ago: "retrospective", before: "retrospective", after: "prospective", in: "prospective" },
	rangeDelimiters: ["..", " to "],
	boundaryAliases: { start: "start", beginning: "start", end: "end", until: "end", include: "include", exclude: "exclude" },
};
export function createV2TemporalSyntaxProfile(profile: Partial<V2TemporalSyntaxProfile> & Pick<V2TemporalSyntaxProfile, "profileId">): V2TemporalSyntaxProfile {
	return { ...V2_TEMPORAL_SYNTAX_DEFAULTS, ...profile, dateRecognitionRules: profile.dateRecognitionRules ?? V2_TEMPORAL_SYNTAX_DEFAULTS.dateRecognitionRules, relativeDayAliases: { ...V2_TEMPORAL_SYNTAX_DEFAULTS.relativeDayAliases, ...profile.relativeDayAliases }, unitAliases: { ...V2_TEMPORAL_SYNTAX_DEFAULTS.unitAliases, ...profile.unitAliases }, directionAliases: { ...V2_TEMPORAL_SYNTAX_DEFAULTS.directionAliases, ...profile.directionAliases }, rangeDelimiters: profile.rangeDelimiters ?? V2_TEMPORAL_SYNTAX_DEFAULTS.rangeDelimiters, boundaryAliases: { ...V2_TEMPORAL_SYNTAX_DEFAULTS.boundaryAliases, ...profile.boundaryAliases } };
}
