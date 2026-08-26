import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { NumericBounds } from "../../contracts/values";
import {
	EMPTY_DIAGNOSTICS,
	type NumericDiagnostic,
	type NumericParseOptions,
	type NumericParseResult,
	type ParsedNumber,
} from "./contracts";

export function validateNumericResult(
	parsed: ParsedNumber,
	bounds?: NumericBounds,
	options: NumericParseOptions = {},
): NumericParseResult {
	if (options.allowedForms && !options.allowedForms.includes(parsed.kind)) {
		return {
			diagnostics: [
				diagnostic("numeric_form_not_allowed", "errors.numericFormNotAllowed", {
					form: parsed.kind,
				}),
			],
		};
	}
	if (parsed.fraction && options.fractionConstraints) {
		const { numerator, denominator } = parsed.fraction;
		const constraints = options.fractionConstraints;
		if (
			constraints.allowImproper === false &&
			numerator >= denominator &&
			parsed.kind === "fraction"
		) {
			return {
				diagnostics: [
					diagnostic(
						"improper_fraction_not_allowed",
						"errors.numericImproperFractionNotAllowed",
					),
				],
			};
		}
		const expected = constraints.denominator;
		if (
			(expected?.exact !== undefined && denominator !== expected.exact) ||
			(expected?.min !== undefined && denominator < expected.min) ||
			(expected?.max !== undefined && denominator > expected.max)
		) {
			return {
				diagnostics: [
					diagnostic(
						"fraction_denominator_invalid",
						"errors.numericFractionDenominatorInvalid",
						{
							denominator,
							...(expected?.exact === undefined
								? {}
								: { expected: expected.exact }),
						},
					),
				],
			};
		}
	}
	if (bounds && !checkNumericBounds(parsed.value, bounds)) {
		return {
			diagnostics: [
				diagnostic("bounds_exceeded", "errors.numericBoundsExceeded", {
					value: parsed.value,
					min: bounds.min ?? "-∞",
					max: bounds.max ?? "+∞",
				}),
			],
		};
	}
	return { parsed, diagnostics: EMPTY_DIAGNOSTICS };
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

function diagnostic(
	code: string,
	messageKey: string,
	messageParams?: Readonly<Record<string, MessageParam>>,
): NumericDiagnostic {
	return { code, messageKey, ...(messageParams ? { messageParams } : {}) };
}
