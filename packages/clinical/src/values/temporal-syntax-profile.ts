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
export function createTemporalSyntaxProfile(
	profile: Partial<TemporalSyntaxProfile> &
		Pick<TemporalSyntaxProfile, "profileId">,
): TemporalSyntaxProfile {
	return {
		...profile,
		dateRecognitionRules: profile.dateRecognitionRules ?? [],
		relativeDayAliases: profile.relativeDayAliases ?? {},
		unitAliases: profile.unitAliases ?? {},
		directionAliases: profile.directionAliases ?? {},
		rangeDelimiters: profile.rangeDelimiters ?? [],
		boundaryAliases: profile.boundaryAliases ?? {},
	};
}
