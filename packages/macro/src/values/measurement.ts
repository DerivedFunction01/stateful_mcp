import type { QuantityValue } from "../contracts/values";
import type { QuantityGrammarResult } from "./quantity";

export interface MeasurementValueOptions {
	rawText?: string;
	evidence?: QuantityValue["evidence"];
	dimension?: QuantityValue["dimension"];
	normalized?: { magnitude: number; unit: string };
}

export function createMeasurementValue(
	magnitude: number,
	unit: string,
	options: MeasurementValueOptions = {},
): QuantityValue {
	return {
		kind: "quantity",
		magnitude,
		unit,
		dimension: options.dimension,
		rawText: options.rawText,
		evidence: options.evidence,
		normalized: options.normalized,
	};
}

export function createMeasurementValueFromQuantity(
	quantity: QuantityGrammarResult,
	options: MeasurementValueOptions = {},
): QuantityValue {
	const primary = quantity.primaryQuantity;
	const value = createMeasurementValue(primary.magnitude, primary.unit, {
		...options,
		rawText: options.rawText ?? quantity.rawText,
		normalized:
			primary.canonicalMagnitude !== undefined && primary.canonicalUnit
				? { magnitude: primary.canonicalMagnitude, unit: primary.canonicalUnit }
				: options.normalized,
	});

	if (quantity.range) {
		value.range = {
			lower: quantity.range.start.magnitude,
			upper: quantity.range.end.magnitude,
			unit: quantity.range.start.unit,
		};
	}

	if (quantity.operator) {
		value.operator = quantity.operator.operator;
	}

	return value;
}
