import type { TemporalDirection, TimePrecisionLevel } from "../schemas/schemas-interface/time";

export interface DateRecognitionRule { pattern: string; precision: TimePrecisionLevel; yearGroup: string; monthGroup: string; dayGroup: string; timeGroup?: string; }
/** Separate from command syntax: controls how temporal text is written/read. */
export interface TemporalSyntaxProfile {
	profileId: string;
	dateRecognitionRules: readonly DateRecognitionRule[];
	relativeDayAliases: Readonly<Record<string, number>>;
	unitAliases: Readonly<Record<string, TimePrecisionLevel>>;
	directionAliases: Readonly<Record<string, TemporalDirection>>;
	rangeDelimiters: readonly string[];
	boundaryAliases?: Readonly<Record<string, "start" | "end" | "include" | "exclude">>;
}
export const _TEMPORAL_SYNTAX_DEFAULTS: TemporalSyntaxProfile = {
	profileId: "v2-temporal-default",
	dateRecognitionRules: [{ pattern: "^(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})(?:T(?<time>[^\\s]+))?$", precision: "day", yearGroup: "year", monthGroup: "month", dayGroup: "day", timeGroup: "time" }],
	relativeDayAliases: { today: 0, yesterday: -1, tomorrow: 1 },
	unitAliases: { second: "second", seconds: "second", minute: "minute", minutes: "minute", hour: "hour", hours: "hour", day: "day", days: "day", week: "week", weeks: "week", month: "month", months: "month", year: "year", years: "year" },
	directionAliases: { ago: "retrospective", before: "retrospective", after: "prospective", in: "prospective" },
	rangeDelimiters: ["..", " to "],
	boundaryAliases: { start: "start", beginning: "start", end: "end", until: "end", include: "include", exclude: "exclude" },
};
export function createTemporalSyntaxProfile(profile: Partial<TemporalSyntaxProfile> & Pick<TemporalSyntaxProfile, "profileId">): TemporalSyntaxProfile {
	return { ..._TEMPORAL_SYNTAX_DEFAULTS, ...profile, dateRecognitionRules: profile.dateRecognitionRules ?? _TEMPORAL_SYNTAX_DEFAULTS.dateRecognitionRules, relativeDayAliases: { ..._TEMPORAL_SYNTAX_DEFAULTS.relativeDayAliases, ...profile.relativeDayAliases }, unitAliases: { ..._TEMPORAL_SYNTAX_DEFAULTS.unitAliases, ...profile.unitAliases }, directionAliases: { ..._TEMPORAL_SYNTAX_DEFAULTS.directionAliases, ...profile.directionAliases }, rangeDelimiters: profile.rangeDelimiters ?? _TEMPORAL_SYNTAX_DEFAULTS.rangeDelimiters, boundaryAliases: { ..._TEMPORAL_SYNTAX_DEFAULTS.boundaryAliases, ...profile.boundaryAliases } };
}
