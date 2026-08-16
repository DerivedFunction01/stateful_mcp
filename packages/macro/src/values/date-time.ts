import { getCompiledRegex } from "./regex";

export type DateTimeToken =
	| "YYYY"
	| "YY"
	| "MM"
	| "MM_name"
	| "DD"
	| "HH"
	| "min"
	| "SS"
	| "ampm"
	| "tz";

export interface TwoDigitYearCenturyConfig {
	readonly pivotYear?: number;
	readonly currentCentury?: number;
	readonly previousCentury?: number;
	readonly centuryDecades?: Readonly<Record<string, string>>;
}

export interface DateTimeFormatOptions {
	centuryDecades?: Record<string, string>;
	twoDigitYear?: TwoDigitYearCenturyConfig;
	is24Hour?: boolean;
	exact?: boolean;
	monthNames?: string[];
	monthAliases?: string[][];
	dayPeriods?: { am: string[]; pm: string[] };
	precision?: string;
	locale?: string;
	timeZone?: string;
}

export interface DateTimeFormatConfig {
	id?: string;
	tokens: DateTimeToken[];
	separators: string[];
	options?: DateTimeFormatOptions;
}

export function resolveTwoDigitYear(
	rawYear: number | string,
	config?: TwoDigitYearCenturyConfig,
): number {
	const numeric = typeof rawYear === "string" ? parseInt(rawYear, 10) : rawYear;
	if (isNaN(numeric)) return NaN;
	if (numeric >= 100) return numeric;
	const pivot = config?.pivotYear ?? 50;
	const currentCentury = config?.currentCentury ?? 2000;
	const previousCentury = config?.previousCentury ?? 1900;
	return numeric <= pivot ? currentCentury + numeric : previousCentury + numeric;
}

export interface DatePatternResult {
	pattern: string;
	groupNames: string[];
}

export function buildDatePatternString(
	tokens: DateTimeToken[],
	separators: string[],
	options: DateTimeFormatOptions = {},
): DatePatternResult {
	if (separators.length !== Math.max(0, tokens.length - 1))
		throw new Error("Separators must equal tokens.length - 1");
	const {
		centuryDecades = { "20": "\\d", "21": "\\d" },
		is24Hour = true,
		exact = false,
		monthNames,
		monthAliases,
		dayPeriods,
	} = options;
	const yyyy = Object.entries(centuryDecades)
		.map(
			([century, decade]) =>
				`${century}${decade === "\\d" ? "\\d{2}" : `${decade}\\d`}`,
		)
		.join("|");
	const monthNamesPattern = monthAliases?.flat() ?? monthNames ?? [];
	const tokenPatterns: Record<DateTimeToken, string> = {
		YYYY: `(?<YYYY>${yyyy.includes("|") ? `(?:${yyyy})` : yyyy})`,
		YY: "(?<YY>\\d{2})",
		MM: "(?<MM>(?:0?[1-9]|1[0-2]))",
		MM_name: `(?<MM_name>${monthNamesPattern.length ? `(?:${monthNamesPattern.map(escapeRegex).join("|")})` : "(?:0?[1-9]|1[0-2])"})`,
		DD: "(?<DD>(?:0?[1-9]|[12]\\d|3[01]))",
		HH: `(?<HH>${is24Hour ? "(?:[01]\\d|2[0-3])" : "(?:0?[1-9]|1[0-2])"})`,
		min: "(?<min>[0-5]\\d)",
		SS: "(?<SS>[0-5]\\d)",
		ampm: `(?<ampm>${dayPeriods ? `(?:${[...dayPeriods.am, ...dayPeriods.pm].map(escapeRegex).join("|")})` : "[AaPp][Mm]"})`,
		tz: "(?<tz>(?:[A-Z]{3,4}|[+-]\\d{2}:?\\d{2}))",
	};
	const assembled = tokens
		.map(
			(token, index) =>
				`${index ? escapeRegex(separators[index - 1]!) : ""}${tokenPatterns[token]}`,
		)
		.join("");
	const boundaryStart = exact ? "^" : "(?<![\\p{L}\\p{N}])";
	const boundaryEnd = exact ? "$" : "(?![\\p{L}\\p{N}])";
	return {
		pattern: `${boundaryStart}${assembled}${boundaryEnd}`,
		groupNames: [...new Set(tokens.map((token) => token.toLowerCase()))],
	};
}

export function compileDateRegex(pattern: string, flags = "giu"): RegExp {
	return getCompiledRegex(pattern, flags);
}

export function buildMonthNameMap(
	monthNames?: string[],
	monthAliases?: string[][],
): Record<string, number> {
	const map: Record<string, number> = {};
	(monthAliases ?? monthNames?.map((name) => [name]) ?? []).forEach(
		(names, index) =>
			names.forEach((name) => {
				map[name.toLocaleLowerCase()] = index + 1;
			}),
	);
	return map;
}

export function buildDayPeriodMap(dayPeriods?: {
	am: string[];
	pm: string[];
}): Map<string, "am" | "pm"> {
	const map = new Map<string, "am" | "pm">();
	for (const value of dayPeriods?.am ?? [])
		map.set(value.toLocaleLowerCase(), "am");
	for (const value of dayPeriods?.pm ?? [])
		map.set(value.toLocaleLowerCase(), "pm");
	return map;
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
