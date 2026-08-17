import type { NumericBounds } from "../contracts/values";
import { normalizeUnicodeDigits } from "./localization";
import { escapeRegex, getCompiledRegex } from "./regex";

export interface ParsedNumber {
	readonly value: number;
	readonly sign: 1 | -1;
	readonly integerPart?: number;
	readonly fraction?: {
		readonly numerator: number;
		readonly denominator: number;
	};
	readonly exponent?: number;
	readonly rawText: string;
	readonly kind:
		| "integer"
		| "decimal"
		| "fraction"
		| "mixed_fraction"
		| "scientific";
}

export interface NumericParseOptions {
	readonly decimalPoint?: string;
	readonly thousandsSeparator?: string;
	readonly allowFractions?: boolean;
	readonly allowMixedFractions?: boolean;
	readonly allowScientific?: boolean;
	readonly allowNegative?: boolean;
	readonly bounds?: NumericBounds;
	readonly locales?: string | readonly string[];
}

export interface NumericDiagnostic {
	readonly code: string;
	readonly message: string;
}

export interface NumericParseResult {
	readonly parsed?: ParsedNumber;
	readonly diagnostics: readonly NumericDiagnostic[];
}

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

const VULGAR_FRACTIONS: Record<string, { num: number; den: number }> = {
	"½": { num: 1, den: 2 },
	"⅓": { num: 1, den: 3 },
	"⅔": { num: 2, den: 3 },
	"¼": { num: 1, den: 4 },
	"¾": { num: 3, den: 4 },
	"⅕": { num: 1, den: 5 },
	"⅖": { num: 2, den: 5 },
	"⅗": { num: 3, den: 5 },
	"⅘": { num: 4, den: 5 },
	"⅙": { num: 1, den: 6 },
	"⅚": { num: 5, den: 6 },
	"⅛": { num: 1, den: 8 },
	"⅜": { num: 3, den: 8 },
	"⅝": { num: 5, den: 8 },
	"⅞": { num: 7, den: 8 },
};

/**
 * Parses a numeric literal string (integer, decimal, fraction, mixed fraction, scientific notation).
 */
export function parseNumericValue(
	input: string,
	options: NumericParseOptions = {},
): NumericParseResult {
	const rawText = input.trim();
	if (!rawText) {
		return {
			diagnostics: [{ code: "empty_input", message: "Numeric text is empty" }],
		};
	}

	const decimalPoint = options.decimalPoint ?? ".";
	const thousandsSep = options.thousandsSeparator;
	const allowNegative = options.allowNegative ?? true;
	const allowFractions = options.allowFractions ?? true;
	const allowMixedFractions = options.allowMixedFractions ?? true;
	const allowScientific = options.allowScientific ?? true;

	let text = normalizeUnicodeDigits(rawText).replace(/[\u2044\u2215]/g, "/");
	let sign: 1 | -1 = 1;

	// Check accounting parentheses for negative (e.g. "(50.25)")
	if (text.startsWith("(") && text.endsWith(")")) {
		if (!allowNegative) {
			return {
				diagnostics: [
					{
						code: "negative_not_allowed",
						message: "Negative numbers are not allowed",
					},
				],
			};
		}
		sign = -1;
		text = text.slice(1, -1).trim();
	} else if (
		text.startsWith("-") ||
		text.startsWith("−") ||
		text.startsWith("–")
	) {
		if (!allowNegative) {
			return {
				diagnostics: [
					{
						code: "negative_not_allowed",
						message: "Negative numbers are not allowed",
					},
				],
			};
		}
		sign = -1;
		text = text.slice(1).trim();
	} else if (text.startsWith("+")) {
		text = text.slice(1).trim();
	}

	// 1. Check for Mixed Fraction with Vulgar Fraction in rawText or text (e.g. "1 ½", "2½", "¾")
	for (const [vChar, vFrac] of Object.entries(VULGAR_FRACTIONS)) {
		if (rawText.includes(vChar)) {
			if (!allowFractions) {
				return {
					diagnostics: [
						{
							code: "fractions_not_allowed",
							message: "Fractions are not allowed",
						},
					],
				};
			}
			const parts = rawText.split(vChar);
			const intPartStr = parts[0]?.replace(/^[-+]/, "").trim();
			if (intPartStr) {
				if (!allowMixedFractions) {
					return {
						diagnostics: [
							{
								code: "mixed_fractions_not_allowed",
								message: "Mixed fractions are not allowed",
							},
						],
					};
				}
				const intVal = Number(intPartStr);
				if (Number.isFinite(intVal)) {
					const val = sign * (intVal + vFrac.num / vFrac.den);
					return validateNumericResult(
						{
							value: val,
							sign,
							integerPart: intVal,
							fraction: {
								numerator: intVal * vFrac.den + vFrac.num,
								denominator: vFrac.den,
							},
							rawText,
							kind: "mixed_fraction",
						},
						options.bounds,
					);
				}
			} else {
				const val = sign * (vFrac.num / vFrac.den);
				return validateNumericResult(
					{
						value: val,
						sign,
						fraction: { numerator: vFrac.num, denominator: vFrac.den },
						rawText,
						kind: "fraction",
					},
					options.bounds,
				);
			}
		}
	}

	// 2. Check for Mixed Fraction with slash (e.g. "1 1/2", "3 3/4")
	if (text.includes(" ") && text.includes("/")) {
		if (!allowMixedFractions) {
			return {
				diagnostics: [
					{
						code: "mixed_fractions_not_allowed",
						message: "Mixed fractions are not allowed",
					},
				],
			};
		}
		const [intStr, fracStr] = text.split(/\s+/);
		if (intStr && fracStr && fracStr.includes("/")) {
			const [numStr, denStr] = fracStr.split("/");
			const intVal = Number(intStr);
			const numVal = Number(numStr);
			const denVal = Number(denStr);
			if (
				Number.isFinite(intVal) &&
				Number.isFinite(numVal) &&
				Number.isFinite(denVal) &&
				denVal !== 0
			) {
				const val = sign * (intVal + numVal / denVal);
				return validateNumericResult(
					{
						value: val,
						sign,
						integerPart: intVal,
						fraction: {
							numerator: intVal * denVal + numVal,
							denominator: denVal,
						},
						rawText,
						kind: "mixed_fraction",
					},
					options.bounds,
				);
			}
		}
	}

	// 3. Check for Simple Fraction (e.g. "3/4", "1/2")
	if (text.includes("/") && !text.includes(" ")) {
		if (!allowFractions) {
			return {
				diagnostics: [
					{
						code: "fractions_not_allowed",
						message: "Fractions are not allowed",
					},
				],
			};
		}
		const [numStr, denStr] = text.split("/");
		const numVal = Number(numStr);
		const denVal = Number(denStr);
		if (Number.isFinite(numVal) && Number.isFinite(denVal)) {
			if (denVal === 0) {
				return {
					diagnostics: [
						{
							code: "division_by_zero",
							message: "Fraction denominator cannot be zero",
						},
					],
				};
			}
			const val = sign * (numVal / denVal);
			return validateNumericResult(
				{
					value: val,
					sign,
					fraction: { numerator: numVal, denominator: denVal },
					rawText,
					kind: "fraction",
				},
				options.bounds,
			);
		}
	}

	// 4. Check for Scientific Notation (e.g. "1.5e-3", "2.4E6")
	if (allowScientific && /[eE][+-]?\d+$/u.test(text)) {
		let cleanText = text;
		if (thousandsSep) {
			cleanText = cleanText.split(thousandsSep).join("");
		}
		if (decimalPoint !== ".") {
			cleanText = cleanText.replace(decimalPoint, ".");
		}
		const val = sign * Number(cleanText);
		if (Number.isFinite(val)) {
			const expMatch = cleanText.match(/[eE]([+-]?\d+)$/u);
			const exponent = expMatch ? Number(expMatch[1]) : undefined;
			return validateNumericResult(
				{
					value: val,
					sign,
					...(exponent !== undefined ? { exponent } : {}),
					rawText,
					kind: "scientific",
				},
				options.bounds,
			);
		}
	}

	// 5. Standard Integer or Decimal
	let cleanText = text;
	if (thousandsSep) {
		cleanText = cleanText.split(thousandsSep).join("");
	}
	if (decimalPoint !== ".") {
		cleanText = cleanText.replace(decimalPoint, ".");
	}

	const parsedVal = Number(cleanText);
	if (!Number.isFinite(parsedVal)) {
		return {
			diagnostics: [
				{
					code: "invalid_number",
					message: `Unable to parse '${rawText}' as a valid number`,
				},
			],
		};
	}

	const isDecimal = cleanText.includes(".");
	const finalVal = sign * parsedVal;

	return validateNumericResult(
		{
			value: finalVal,
			sign,
			integerPart: isDecimal ? Math.trunc(parsedVal) : parsedVal,
			rawText,
			kind: isDecimal ? "decimal" : "integer",
		},
		options.bounds,
	);
}

function validateNumericResult(
	parsed: ParsedNumber,
	bounds?: NumericBounds,
): NumericParseResult {
	if (bounds) {
		if (!checkNumericBounds(parsed.value, bounds)) {
			return {
				diagnostics: [
					{
						code: "bounds_exceeded",
						message: `Value ${parsed.value} is outside permitted bounds [${bounds.min ?? "-∞"}, ${bounds.max ?? "+∞"}]`,
					},
				],
			};
		}
	}

	return {
		parsed,
		diagnostics: [],
	};
}

/** Format a finite number using separators and precision. */
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
