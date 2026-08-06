import { UNIT_DISPLAY_MAP } from "../schemas/schemas-interface/measurement";
import type {
	TemporalDirection,
	TimePrecisionLevel,
} from "../schemas/schemas-interface/time";
import type { NumericFieldFormatOptions } from "../stores/interfaces";
import type { DateTimeFormatConfig } from "./utils/date-regex-generator";
import {
	type NumberWordConfig,
	NumberWordNormalizer,
} from "./utils/number-word-normalizer";

/** The temporal configuration sub-object embedded in NumericalSyntaxProfile. */
export interface TemporalSyntaxConfig {
	dateTimeFormats: readonly DateTimeFormatConfig[];
	relativeDayAliases: Readonly<Record<string, number>>;
	relativeDayDisplayLabels?: Readonly<Record<string, string>>;
	unitAliases: Readonly<Record<string, TimePrecisionLevel>>;
	directionAliases: Readonly<Record<string, TemporalDirection>>;
	rangeDelimiters: readonly string[];
	boundaryAliases?: Readonly<
		Record<string, "start" | "end" | "include" | "exclude">
	>;
}

/** Defaults bag (all fields optional) for createNumericalSyntaxProfile. */
export interface NumericalSyntaxProfileDefaults {
	temporal?: Partial<TemporalSyntaxConfig>;
	numberWords?: NumberWordConfig | null;
	unitDisplay?: Readonly<Record<string, string>>;
	numericFormat?: NumericFieldFormatOptions;
}

/** Single top-level profile for all numeric input/display concerns. */
export interface NumericalSyntaxProfile {
	profileId: string;
	/** Date and time recognition / formatting configuration. */
	temporal: TemporalSyntaxConfig;
	/** Number-word-to-digit normalisation (e.g. "five" → 5). Null = disabled. */
	numberWords: NumberWordConfig | null;
	/**
	 * Unit display overrides layered on top of the built-in UNIT_DISPLAY_MAP.
	 * e.g. { ug: "μg", fl_oz: "fl oz" }
	 */
	unitDisplay: Readonly<Record<string, string>>;
	/** Numeric field format options used during input parsing. */
	numericFormat?: NumericFieldFormatOptions;
}

export function createNumericalSyntaxProfile(
	profile: Partial<NumericalSyntaxProfile> &
		Pick<NumericalSyntaxProfile, "profileId">,
	defaults?: NumericalSyntaxProfileDefaults,
): NumericalSyntaxProfile {
	const temporal: TemporalSyntaxConfig = {
		dateTimeFormats:
			profile.temporal?.dateTimeFormats ??
			defaults?.temporal?.dateTimeFormats ??
			[],
		relativeDayAliases:
			profile.temporal?.relativeDayAliases ??
			defaults?.temporal?.relativeDayAliases ??
			{},
		relativeDayDisplayLabels:
			profile.temporal?.relativeDayDisplayLabels ??
			defaults?.temporal?.relativeDayDisplayLabels,
		unitAliases:
			profile.temporal?.unitAliases ?? defaults?.temporal?.unitAliases ?? {},
		directionAliases:
			profile.temporal?.directionAliases ??
			defaults?.temporal?.directionAliases ??
			{},
		rangeDelimiters:
			profile.temporal?.rangeDelimiters ??
			defaults?.temporal?.rangeDelimiters ??
			[],
		boundaryAliases:
			profile.temporal?.boundaryAliases ??
			defaults?.temporal?.boundaryAliases ??
			{},
	};
	return {
		...profile,
		temporal,
		numberWords:
			profile.numberWords !== undefined
				? profile.numberWords
				: (defaults?.numberWords ?? null),
		unitDisplay: profile.unitDisplay ?? defaults?.unitDisplay ?? {},
		numericFormat: profile.numericFormat ?? defaults?.numericFormat,
	};
}

/**
 * Resolve a unit's display string. Profile overrides are applied on top of the
 * built-in UNIT_DISPLAY_MAP; if neither has an entry the raw unit string is returned.
 */
export function resolveUnitDisplay(
	unit: string,
	profile?: NumericalSyntaxProfile,
): string {
	return profile?.unitDisplay[unit] ?? UNIT_DISPLAY_MAP[unit] ?? unit;
}

/**
 * Normalise number-words in text using the profile's NumberWordConfig.
 * Returns text unchanged when numberWords is null or no profile is supplied.
 */
export function normalizeNumberWords(
	text: string,
	profile?: NumericalSyntaxProfile,
): string {
	if (!profile?.numberWords) return text;
	return new NumberWordNormalizer(profile.numberWords).normalize(text)
		.normalizedText;
}
