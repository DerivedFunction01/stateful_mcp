import type { NumericBounds } from "../contracts/values";
import { escapeRegex, getCompiledRegex } from "./regex";

export interface NumericFormatOptions {
	integerDigits?: number;
	decimalDigits?: number;
	thousandsSeparator?: string;
	decimalPoint?: string;
	allowNegative?: boolean;
	exact?: boolean;
	leadingMin?: number;
	leadingMax?: number;
	currencySymbols?: readonly string[];
	currencyPosition?: "prefix" | "suffix";
	negativeStyle?: "sign" | "parens" | "both";
	groupName?: string;
	wrap?: boolean;
}

/** Format a finite number using the same separators and precision as its grammar. */
export function formatNumericValue(
	value: number,
	options: NumericFormatOptions = {},
): string {
	if (!Number.isFinite(value)) return String(value);
	const decimalPoint = options.decimalPoint ?? ".";
	const isNegative = value < 0 || Object.is(value, -0);
	const absolute = Math.abs(value);
	const numeric =
		options.decimalDigits === undefined
			? String(absolute)
			: absolute.toFixed(Math.max(0, options.decimalDigits));
	let [integer = "0", fraction] = numeric.split(".");
	if (!options.exact && fraction) fraction = fraction.replace(/0+$/u, "");
	if (options.thousandsSeparator) {
		integer = integer.replace(
			/\B(?=(\d{3})+(?!\d))/gu,
			options.thousandsSeparator,
		);
	}
	const body = fraction ? `${integer}${decimalPoint}${fraction}` : integer;
	let formatted = isNegative ? `-${body}` : body;
	if (isNegative && options.negativeStyle === "parens") formatted = `(${body})`;
	if (isNegative && options.negativeStyle === "both") formatted = `(-${body})`;
	const symbol = options.currencySymbols?.[0];
	if (symbol) {
		formatted =
			options.currencyPosition === "suffix"
				? `${formatted} ${symbol}`
				: `${symbol}${formatted}`;
	}
	return formatted;
}

export function buildNumericPatternString(
	options: NumericFormatOptions = {},
): string {
	const {
		integerDigits,
		thousandsSeparator,
		decimalPoint = ".",
		allowNegative = integerDigits === undefined,
		exact = false,
		leadingMin,
		leadingMax,
		currencySymbols = [],
		currencyPosition = "prefix",
		negativeStyle = "sign",
		groupName,
		wrap = true,
	} = options;
	const leading =
		leadingMin !== undefined && leadingMax !== undefined
			? `[${leadingMin}-${leadingMax}]?`
			: "";
	const integer =
		integerDigits !== undefined
			? thousandsSeparator
				? `\\d{1,${integerDigits}}`
				: `\\d{${integerDigits}}`
			: thousandsSeparator
				? `(?:\\d{1,3}(?:${escapeRegex(thousandsSeparator)}\\d{3})+|${leading}\\d+)`
				: `${leading}\\d+`;
	const decimalDigits =
		options.decimalDigits ?? (integerDigits !== undefined ? 0 : undefined);
	const decimal =
		decimalDigits === 0
			? ""
			: `(?:${escapeRegex(decimalPoint)}\\d${decimalDigits === undefined ? "+" : `{1,${decimalDigits}}`})?`;
	const numeric = `${integer}${decimal}`;
	const currency = currencySymbols.length
		? `(?:${currencySymbols.map(escapeRegex).join("|")})?`
		: "";
	const sign = allowNegative ? "[-\\u2212\\u2013]?" : "";
	const standard =
		currencyPosition === "prefix"
			? `${sign}${currency}${numeric}`
			: `${sign}${numeric}${currency}`;
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

export function checkNumericBounds(
	value: number,
	bounds?: NumericBounds,
): boolean {
	if (!bounds) return true;
	if (
		bounds.min !== undefined &&
		(bounds.inclusiveMin === false ? value <= bounds.min : value < bounds.min)
	)
		return false;
	if (
		bounds.max !== undefined &&
		(bounds.inclusiveMax === false ? value >= bounds.max : value > bounds.max)
	)
		return false;
	return true;
}
