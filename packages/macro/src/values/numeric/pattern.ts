import { escapeRegex, getCompiledRegex } from "../regex";
import type { NumericFormatOptions } from "./contracts";

export function buildNumericPatternString(
	options: NumericFormatOptions = {},
): string {
	const {
		integerDigits,
		thousandsSeparator,
		decimalPoint = options.decimalSeparator ?? ".",
		allowNegative = integerDigits === undefined,
		allowFractions = false,
		allowMixedFractions = false,
		allowScientific = false,
		exact = false,
		leadingMin,
		leadingMax,
		currencySymbols = [],
		currencyPosition = "prefix",
		negativeStyle = "sign",
		groupName,
		wrap = true,
	} = options;

	const digits = "[\\d\\p{Nd}]";
	const leading =
		leadingMin !== undefined && leadingMax !== undefined
			? `[${leadingMin}-${leadingMax}]?`
			: "";

	const integer =
		integerDigits !== undefined
			? thousandsSeparator
				? `${digits}{1,${integerDigits}}`
				: `${digits}{${integerDigits}}`
			: thousandsSeparator
				? `(?:${digits}{1,3}(?:${escapeRegex(thousandsSeparator)}${digits}{3})+|${leading}${digits}+)`
				: `${leading}${digits}+`;

	const decimalDigits =
		options.decimalDigits ?? (integerDigits !== undefined ? 0 : undefined);
	const decimal =
		decimalDigits === 0
			? ""
			: `(?:${escapeRegex(decimalPoint)}${digits}${decimalDigits === undefined ? "+" : `{1,${decimalDigits}}`})?`;
	const standardNumeric = `${integer}${decimal}`;

	const variants: string[] = [];

	// 1. Mixed fractions (e.g. "1 1/2", "2 ½")
	if (allowMixedFractions) {
		const vulgar = "[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]";
		const slashFrac = `${digits}+\\s*[/\\u2044\\u2215]\\s*${digits}+`;
		variants.push(`(?:${integer}\\s+${slashFrac})`);
		variants.push(`(?:${integer}\\s*${vulgar})`);
	}

	// 2. Scientific notation (e.g. "1.5e-3", "2.4E6")
	if (allowScientific) {
		variants.push(`(?:${standardNumeric}[eE][+-]?${digits}+)`);
	}

	// 3. Simple fractions (e.g. "3/4", "½")
	if (allowFractions) {
		const vulgar = "[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]";
		const slashFrac = `${digits}+\\s*[/\\u2044\\u2215]\\s*${digits}+`;
		variants.push(`(?:${slashFrac})`);
		variants.push(vulgar);
	}

	// 4. Standard integer / decimal
	variants.push(standardNumeric);

	const coreNumber =
		variants.length === 1 ? standardNumeric : `(?:${variants.join("|")})`;

	const currency = currencySymbols.length
		? `(?:${currencySymbols.map(escapeRegex).join("|")})?`
		: "";
	const sign = allowNegative ? "[-\\u2212\\u2013]?" : "";
	const standard =
		currencyPosition === "prefix"
			? `${sign}${currency}${coreNumber}`
			: `${sign}${coreNumber}${currency}`;
	const parenthesized =
		allowNegative && (negativeStyle === "parens" || negativeStyle === "both")
			? `\\(${standard}\\)`
			: "";
	const core = parenthesized ? `(?:${standard}|${parenthesized})` : standard;
	const result = exact ? `^${core}$` : core;
	return wrap && groupName ? `(?<${groupName}>${result})` : result;
}

export function compileNumericRegex(pattern: string, flags = "giu"): RegExp {
	return getCompiledRegex(pattern, flags);
}
