import { escapeRegex, getCompiledRegex } from "./regex";

export interface ValueFormatConfig<
	TToken extends string = string,
	TOptions = unknown,
> {
	readonly id?: string;
	readonly tokens: readonly TToken[];
	readonly separators: readonly string[];
	readonly options?: TOptions;
}

export const FREQUENCY_TOKENS = [
	"INTERVAL_PREFIX",
	"INTERVAL_MAG",
	"INTERVAL_HIGH",
	"INTERVAL_UNIT",
	"RECURRENCE_COUNT",
	"RECURRENCE_CONN",
	"PERIOD",
	"OFFSET_MAG",
	"OFFSET_UNIT",
	"OFFSET_DIR",
	"ANCHOR",
	"PRN_TRIGGER",
	"CONDITION",
] as const;
export type FrequencyToken = (typeof FREQUENCY_TOKENS)[number];

export const QUANTITY_TOKENS = [
	"NUM",
	"NUM_LOW",
	"NUM_HIGH",
	"UNIT",
	"PKG_CLASSIFIER",
	"FILLER",
	"OP_PREFIX",
	"OP_POSTFIX",
	"STAT_QUALIFIER",
] as const;
export type QuantityToken = (typeof QUANTITY_TOKENS)[number];

export const CURRENCY_TOKENS = [
	"SYM",
	"CODE",
	"AMOUNT",
	"SUBUNITS",
	"OP",
] as const;
export type CurrencyToken = (typeof CURRENCY_TOKENS)[number];

export const RATE_TOKENS = [
	"NUMERATOR",
	"RATE_DELIM",
	"DENOMINATOR",
	"DIVISOR_MAG",
] as const;
export type RateToken = (typeof RATE_TOKENS)[number];

export const DURATION_TOKENS = [
	"DUR_MAG",
	"DUR_UNIT",
	"DUR_DELIM",
	"DUR_DIR",
] as const;
export type DurationToken = (typeof DURATION_TOKENS)[number];

export const RELATIVE_TIME_TOKENS = [
	"REL_DIR",
	"REL_UNIT",
	"REL_ALIAS",
] as const;
export type RelativeTimeToken = (typeof RELATIVE_TIME_TOKENS)[number];

export const DATE_TIME_TOKENS = [
	"YYYY",
	"YY",
	"MM_name",
	"MM",
	"DDD",
	"DD",
	"HH",
	"min",
	"SS",
	"ampm",
	"tz",
] as const;
export type DateTimeToken = (typeof DATE_TIME_TOKENS)[number];

export type DomainToken =
	| FrequencyToken
	| QuantityToken
	| CurrencyToken
	| RateToken
	| DurationToken
	| RelativeTimeToken
	| DateTimeToken;

/**
 * Parses a format template string into structured tokens and separators.
 * Longest tokens in the catalog are prioritized.
 */
export function parseFormatTemplate<TToken extends string = string>(
	templateStr: string,
	tokenCatalog: readonly TToken[],
	id?: string,
): ValueFormatConfig<TToken> {
	const sortedCatalog = [...tokenCatalog].sort((a, b) => b.length - a.length);
	const tokens: TToken[] = [];
	const separators: string[] = [];

	let remaining = templateStr;
	let currentSep = "";

	while (remaining.length > 0) {
		let matchedToken: TToken | undefined;
		for (const token of sortedCatalog) {
			if (remaining.startsWith(token)) {
				matchedToken = token;
				break;
			}
		}

		if (matchedToken) {
			separators.push(currentSep);
			tokens.push(matchedToken);
			currentSep = "";
			remaining = remaining.slice(matchedToken.length);
		} else {
			currentSep += remaining[0];
			remaining = remaining.slice(1);
		}
	}
	separators.push(currentSep);

	return {
		...(id ? { id } : {}),
		tokens: Object.freeze(tokens),
		separators: Object.freeze(separators),
	};
}

/**
 * Converts a structured ValueFormatConfig or tokens/separators pair back into a template string.
 */
export function formatTemplateToString<TToken extends string = string>(
	config:
		| ValueFormatConfig<TToken>
		| {
				readonly tokens: readonly TToken[];
				readonly separators: readonly string[];
		  },
): string {
	const { tokens, separators } = config;
	let result = separators[0] ?? "";
	for (let i = 0; i < tokens.length; i++) {
		result += tokens[i]! + (separators[i + 1] ?? "");
	}
	return result;
}

export interface CompileFormatRegexOptions {
	readonly exact?: boolean;
	readonly caseInsensitive?: boolean;
	readonly unicode?: boolean;
	readonly flexibleWhitespace?: boolean;
}

/**
 * Compiles a ValueFormatConfig or template string into a RegExp with named capture groups.
 */
export function compileFormatRegex<TToken extends string = string>(
	formatConfig: ValueFormatConfig<TToken> | string,
	tokenPatternMap: Readonly<Record<string, string>>,
	options: CompileFormatRegexOptions = {},
	tokenCatalog?: readonly TToken[],
): RegExp {
	const config: ValueFormatConfig<TToken> =
		typeof formatConfig === "string"
			? parseFormatTemplate(
					formatConfig,
					tokenCatalog ??
						(Object.keys(tokenPatternMap) as unknown as readonly TToken[]),
				)
			: formatConfig;

	const exact = options.exact ?? true;
	const caseInsensitive = options.caseInsensitive ?? true;
	const unicode = options.unicode ?? true;
	const flexibleWhitespace = options.flexibleWhitespace ?? true;

	let pattern = "";
	const { tokens, separators } = config;

	const formatSeparator = (sep: string): string => {
		if (!sep) return "";
		if (flexibleWhitespace && /\s+/.test(sep)) {
			// Replace whitespace runs in separator with \s+ or \s*
			return sep
				.split(/(\s+)/)
				.map((part) => (/\s+/.test(part) ? "\\s+" : escapeRegex(part)))
				.join("");
		}
		return escapeRegex(sep);
	};

	pattern += formatSeparator(separators[0] ?? "");

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;
		const tokenPattern = tokenPatternMap[token] ?? `(?<${token}>.+)`;
		pattern += tokenPattern;
		pattern += formatSeparator(separators[i + 1] ?? "");
	}

	const finalPattern = exact ? `^${pattern}$` : pattern;
	const flags = `${caseInsensitive ? "i" : ""}${unicode ? "u" : ""}`;
	return getCompiledRegex(finalPattern, flags);
}
