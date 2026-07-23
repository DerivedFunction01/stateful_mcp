import { getCompiledRegex } from "../_compiled-regex";

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

export interface DateTimeFormatConfig {
	tokens: DateTimeToken[];
	separators: string[];
	options?: {
		centuryDecades?: Record<string, string>;
		is24Hour?: boolean;
		exact?: boolean;
		monthNames?: string[];
	};
}

export interface DatePatternResult {
	pattern: string;
	groupNames: string[];
}

function compressToRange(digits: (string | number | undefined)[]): string {
	const validDigits = digits.filter(
		(d): d is string | number => d !== undefined,
	);
	const sorted = Array.from(new Set(validDigits.map(Number))).sort(
		(a, b) => a - b,
	);
	if (sorted.length === 0) return "";
	if (sorted.length === 1) return String(sorted[0]);

	const ranges: string[] = [];
	let start = sorted[0]!;
	let prev = sorted[0]!;

	for (let i = 1; i < sorted.length; i++) {
		const curr = sorted[i]!;
		if (curr === prev + 1) {
			prev = curr;
		} else {
			ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
			start = curr;
			prev = curr;
		}
	}
	ranges.push(start === prev ? `${start}` : `${start}-${prev}`);

	const combined = ranges.join("");
	return combined.length > 1 ? `[${combined}]` : combined;
}

export function buildDatePatternString(
	tokens: DateTimeToken[],
	separators: string[],
	options: DateTimeFormatConfig["options"] = {},
): DatePatternResult {
	if (separators.length !== Math.max(0, tokens.length - 1)) {
		throw new Error(
			"The number of separators must be exactly equal to tokens.length - 1",
		);
	}

	const {
		centuryDecades = { "20": "\\d", "21": "\\d" },
		is24Hour = true,
		exact = false,
		monthNames = [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		],
	} = options;

	const centuryEntries = Object.entries(centuryDecades);
	const decadeMap = new Map<string, string[]>();
	for (const [century, decade] of centuryEntries) {
		if (!decadeMap.has(decade)) decadeMap.set(decade, []);
		decadeMap.get(decade)!.push(century);
	}

	const factoredCenturyParts: string[] = [];
	for (const [decade, centuries] of decadeMap.entries()) {
		let centuryPrefix = "";
		if (centuries.length === 1) {
			centuryPrefix = centuries[0]!;
		} else {
			const firstDigits = centuries.map((c) => c[0]);
			const uniqueFirstDigits = Array.from(new Set(firstDigits));
			if (uniqueFirstDigits.length === 1) {
				const secondDigits = centuries.map((c) => c[1]);
				centuryPrefix = `${uniqueFirstDigits[0]}${compressToRange(secondDigits)}`;
			} else {
				centuryPrefix = `(?:${centuries.join("|")})`;
			}
		}
		const decadeSuffix = decade === "\\d" ? "\\d{2}" : `${decade}\\d`;
		factoredCenturyParts.push(`${centuryPrefix}${decadeSuffix}`);
	}

	const yyyyPattern =
		factoredCenturyParts.length > 1
			? `(?:${factoredCenturyParts.join("|")})`
			: factoredCenturyParts[0]!;
	const yyPattern = "\\d{2}";

	const mmPattern = "(?:0?[1-9]|1[0-2])";
	const mmNamePattern =
		monthNames.length > 0 ? `(?:${monthNames.join("|")})` : mmPattern;
	const ddPattern = "(?:0?[1-9]|[12]\\d|3[01])";
	const hhPattern = is24Hour ? "(?:[01]\\d|2[0-3])" : "(?:0?[1-9]|1[0-2])";
	const minSecPattern = "[0-5]\\d";
	const ampmPattern = "[AaPp][Mm]";
	const tzPattern = "(?:[A-Z]{3,4}|[+-]\\d{2}:?\\d{2})";

	const tokenPatternMap: Record<DateTimeToken, (groupName: string) => string> =
		{
			YYYY: (name) => `(?<${name}>${yyyyPattern})`,
			YY: (name) => `(?<${name}>${yyPattern})`,
			MM: (name) => `(?<${name}>${mmPattern})`,
			MM_name: (name) => `(?<${name}>${mmNamePattern})`,
			DD: (name) => `(?<${name}>${ddPattern})`,
			HH: (name) => `(?<${name}>${hhPattern})`,
			min: (name) => `(?<${name}>${minSecPattern})`,
			SS: (name) => `(?<${name}>${minSecPattern})`,
			ampm: (name) => `(?<${name}>${ampmPattern})`,
			tz: (name) => `(?<${name}>${tzPattern})`,
		};

	const nameCounts = new Map<string, number>();

	const compiledTokens = tokens.map((token) => {
		const baseName = token.toLowerCase();
		const count = (nameCounts.get(baseName) || 0) + 1;
		nameCounts.set(baseName, count);
		const groupName = count === 1 ? baseName : `${baseName}_${count}`;

		return tokenPatternMap[token](groupName);
	});

	let assembled = compiledTokens[0]!;
	for (let i = 0; i < separators.length; i++) {
		const sep = separators[i]!;
		const escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		assembled += escapedSep + compiledTokens[i + 1]!;
	}

	const startAnchor = exact ? "^" : "\\b";
	const endAnchor = exact ? "$" : "\\b";

	return { pattern: `${startAnchor}${assembled}${endAnchor}`, groupNames: Array.from(nameCounts.keys()) };
}

export function buildMonthNameMap(
	monthNames?: string[],
): Record<string, number> {
	if (!monthNames || monthNames.length === 0) return {};
	const map: Record<string, number> = {};
	monthNames.forEach((name, idx) => {
		map[name.toLowerCase()] = idx + 1;
	});
	return map;
}

export function compileDateRegex(pattern: string, flags = "gi"): RegExp {
	return getCompiledRegex(pattern, flags);
}
