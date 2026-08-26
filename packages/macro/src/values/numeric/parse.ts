import { validateNumericResult } from "./bounds";
import type { NumericParseOptions, NumericParseResult } from "./contracts";
import { hasScientificNotation } from "./forms";
import { VULGAR_FRACTIONS } from "./fractions";
import { cleanNumericText } from "./grouping";
import { tokenizeNumericInput } from "./tokenizer";
import { isNegativeNumericPrefix } from "./words";

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
			diagnostics: [
				{
					code: "empty_input",
					messageKey: "errors.numericEmpty",
				},
			],
		};
	}

	const decimalPoint = options.decimalPoint ?? options.decimalSeparator ?? ".";
	const thousandsSep = options.thousandsSeparator;
	const allowNegative = options.allowNegative ?? true;
	const allowFractions = options.allowFractions ?? true;
	const allowMixedFractions = options.allowMixedFractions ?? true;
	const allowScientific = options.allowScientific ?? true;

	let text = tokenizeNumericInput(rawText);
	let sign: 1 | -1 = 1;

	// Check accounting parentheses for negative (e.g. "(50.25)")
	if (text.startsWith("(") && text.endsWith(")")) {
		if (!allowNegative) {
			return {
				diagnostics: [
					{
						code: "negative_not_allowed",
						messageKey: "errors.numericNegativeNotAllowed",
					},
				],
			};
		}
		sign = -1;
		text = text.slice(1, -1).trim();
	} else if (text.startsWith("-") || isNegativeNumericPrefix(text)) {
		if (!allowNegative) {
			return {
				diagnostics: [
					{
						code: "negative_not_allowed",
						messageKey: "errors.numericNegativeNotAllowed",
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
							messageKey: "errors.numericFractionsNotAllowed",
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
								messageKey: "errors.numericMixedFractionsNotAllowed",
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
						options,
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
					options,
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
						messageKey: "errors.numericMixedFractionsNotAllowed",
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
					options,
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
						messageKey: "errors.numericFractionsNotAllowed",
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
							messageKey: "errors.numericDivisionByZero",
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
				options,
			);
		}
	}

	// 4. Check for Scientific Notation (e.g. "1.5e-3", "2.4E6")
	if (allowScientific && hasScientificNotation(text)) {
		const cleanText = cleanNumericText(text, thousandsSep, decimalPoint);
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
				options,
			);
		}
	}

	// 5. Standard Integer or Decimal
	const cleanText = cleanNumericText(text, thousandsSep, decimalPoint);

	const parsedVal = Number(cleanText);
	if (!Number.isFinite(parsedVal)) {
		return {
			diagnostics: [
				{
					code: "invalid_number",
					messageKey: "errors.numericInvalid",
					messageParams: { rawText },
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
		options,
	);
}
