import type { QuantityValue } from "../contracts/values";
import type { QuantityGrammarResult } from "./quantity";

export interface MeasurementValueOptions {
	rawText?: string;
	evidence?: QuantityValue["evidence"];
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
		rawText: options.rawText,
		evidence: options.evidence,
		normalized: options.normalized,
	};
}

export function createMeasurementValueFromQuantity(
	quantity: QuantityGrammarResult,
	options: MeasurementValueOptions = {},
): QuantityValue {
	const value = createMeasurementValue(quantity.lower, quantity.unit, {
		...options,
		rawText: options.rawText ?? quantity.rawText,
	});
	if (quantity.upper !== undefined)
		value.range = {
			lower: quantity.lower,
			upper: quantity.upper,
			unit: quantity.unit,
		};
	if (quantity.operator) value.operator = quantity.operator;
	return value;
}
