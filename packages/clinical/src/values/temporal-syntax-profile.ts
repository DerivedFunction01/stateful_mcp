import type {
	TemporalDirection,
	TimePrecisionLevel,
} from "../schemas/schemas-interface/time";

export interface DateRecognitionRule {
	pattern: string;
	precision: TimePrecisionLevel;
	yearGroup: string;
	monthGroup: string;
	dayGroup: string;
	timeGroup?: string;
}
/** Separate from command syntax: controls how temporal text is written/read. */
export interface TemporalSyntaxProfile {
	profileId: string;
	dateRecognitionRules: readonly DateRecognitionRule[];
	relativeDayAliases: Readonly<Record<string, number>>;
	unitAliases: Readonly<Record<string, TimePrecisionLevel>>;
	directionAliases: Readonly<Record<string, TemporalDirection>>;
	rangeDelimiters: readonly string[];
	boundaryAliases?: Readonly<
		Record<string, "start" | "end" | "include" | "exclude">
	>;
}
export interface TemporalSyntaxProfileDefaults {
	dateRecognitionRules?: readonly DateRecognitionRule[];
	relativeDayAliases?: Readonly<Record<string, number>>;
	unitAliases?: Readonly<Record<string, TimePrecisionLevel>>;
	directionAliases?: Readonly<Record<string, TemporalDirection>>;
	rangeDelimiters?: readonly string[];
	boundaryAliases?: Readonly<
		Record<string, "start" | "end" | "include" | "exclude">
	>;
}
export function createTemporalSyntaxProfile(
	profile: Partial<TemporalSyntaxProfile> &
		Pick<TemporalSyntaxProfile, "profileId">,
	defaults?: TemporalSyntaxProfileDefaults,
): TemporalSyntaxProfile {
	return {
		...profile,
		dateRecognitionRules:
			profile.dateRecognitionRules ?? defaults?.dateRecognitionRules ?? [],
		relativeDayAliases:
			profile.relativeDayAliases ?? defaults?.relativeDayAliases ?? {},
		unitAliases:
			profile.unitAliases ?? defaults?.unitAliases ?? {},
		directionAliases:
			profile.directionAliases ?? defaults?.directionAliases ?? {},
		rangeDelimiters:
			profile.rangeDelimiters ?? defaults?.rangeDelimiters ?? [],
		boundaryAliases:
			profile.boundaryAliases ?? defaults?.boundaryAliases ?? {},
	};
}
