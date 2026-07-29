/**
 * Measurement Conversion — public API.
 *
 * This module provides a single delegator function that computes the canonical
 * base-unit value for a measurement at parse time.  It delegates to the
 * registry and conversion-factor tables defined in sibling files.
 *
 * Usage:
 *   import { computeValueInBase } from "./measurement-conversion";
 *
 *   const valueInBase = computeValueInBase("pressure", "mmHg", 120);
 *   // → 15998.6864898
 */

import type { MeasurementUnitAnchor } from "../../../schemas/measurement";
import { getDefaultConversionRegistry } from "./registry";

export {
	ANCHOR_TO_CONVERSIONS,
	normalizeMeasurementValue,
} from "./conversion-factors";
export {
	type ConversionEntry,
	getDefaultConversionRegistry,
	UnitConversionRegistry,
} from "./registry";

/**
 * Compute the canonical base-unit value for a measurement.
 *
 * @param anchor   The physical-dimension anchor (e.g. "pressure", "length").
 * @param unit     The unit string as it appears in parsed data (e.g. "mmHg", "cm").
 * @param magnitude  The numeric value in the original unit.
 * @returns The value in the canonical base unit, or `undefined` if no
 *          conversion is registered for the given anchor + unit combination.
 *
 * The returned value is suitable for storing in `BoundedMeasurement.valueInBase`.
 */
export function computeValueInBase(
	anchor: MeasurementUnitAnchor,
	unit: string,
	magnitude: number,
): number | undefined {
	const registry = getDefaultConversionRegistry();
	return registry.convertToBase(anchor, unit, magnitude);
}

/**
 * Convert a value from the canonical base unit back to a specific unit.
 * Useful for display or reverse-lookup scenarios.
 *
 * @param anchor   The physical-dimension anchor.
 * @param unit     The target unit string.
 * @param valueInBase  The numeric value in the canonical base unit.
 * @returns The value in the target unit, or `undefined` if no conversion is
 *          registered.
 */
export function computeFromBase(
	anchor: MeasurementUnitAnchor,
	unit: string,
	valueInBase: number,
): number | undefined {
	const registry = getDefaultConversionRegistry();
	return registry.convertFromBase(anchor, unit, valueInBase);
}
