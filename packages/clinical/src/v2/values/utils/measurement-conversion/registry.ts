/**
 * UnitConversionRegistry — maps unit anchors to conversion functions.
 *
 * The registry is populated from the static conversion tables defined in
 * `conversion-factors.ts`.  It provides a runtime lookup for converting
 * measurement values to/from their canonical base unit.
 *
 * Usage:
 *   const registry = new UnitConversionRegistry();
 *   const valueInBase = registry.convertToBase("pressure", "mmHg", 120);
 *   // → 15998.6864898 (pascals)
 */

import type { MeasurementUnitAnchor } from "../../../schemas/schemas-interface/measurement";
import { ANCHOR_TO_CONVERSIONS } from "./conversion-factors";

export interface ConversionEntry {
	fromUnit: string;
	toBase: (value: number) => number;
	fromBase: (value: number) => number;
}

export class UnitConversionRegistry {
	/** Maps anchor → (unit → ConversionEntry) */
	private readonly anchors: Map<
		MeasurementUnitAnchor,
		Map<string, ConversionEntry>
	> = new Map();

	/**
	 * Pre-populate the registry from the static conversion tables.
	 * Called automatically by the constructor; you may call it again to
	 * override or extend entries at runtime.
	 */
	loadDefaults(): void {
		for (const [anchor, table] of Object.entries(ANCHOR_TO_CONVERSIONS)) {
			if (!table) continue;
			const a = anchor as MeasurementUnitAnchor;
			for (const [unit, conv] of Object.entries(table)) {
				this.register(a, unit, conv.toBase, conv.fromBase);
			}
		}
	}

	/**
	 * Register a single conversion entry.
	 *
	 * @param anchor  The physical-dimension anchor (e.g. "length", "pressure").
	 * @param fromUnit  The unit string as it appears in parsed data (e.g. "mmHg").
	 * @param toBase    Function that converts a value from `fromUnit` to the canonical base.
	 * @param fromBase  Function that converts a value from the canonical base back to `fromUnit`.
	 */
	register(
		anchor: MeasurementUnitAnchor,
		fromUnit: string,
		toBase: (value: number) => number,
		fromBase: (value: number) => number,
	): void {
		let anchorMap = this.anchors.get(anchor);
		if (!anchorMap) {
			anchorMap = new Map();
			this.anchors.set(anchor, anchorMap);
		}
		anchorMap.set(fromUnit, { fromUnit, toBase, fromBase });
	}

	/**
	 * Look up the conversion entry for a given anchor + unit.
	 * Returns `undefined` if no conversion is registered.
	 */
	getConversion(
		anchor: MeasurementUnitAnchor,
		fromUnit: string,
	): ConversionEntry | undefined {
		return this.anchors.get(anchor)?.get(fromUnit);
	}

	/**
	 * Convert a value from the given unit to the canonical base unit.
	 *
	 * @param anchor   The physical-dimension anchor.
	 * @param fromUnit The source unit string.
	 * @param value    The numeric value to convert.
	 * @returns The converted value, or `undefined` if no conversion is registered.
	 */
	convertToBase(
		anchor: MeasurementUnitAnchor,
		fromUnit: string,
		value: number,
	): number | undefined {
		const entry = this.getConversion(anchor, fromUnit);
		return entry ? entry.toBase(value) : undefined;
	}

	/**
	 * Convert a value from the canonical base unit back to the given unit.
	 *
	 * @param anchor The physical-dimension anchor.
	 * @param toUnit The target unit string.
	 * @param value  The numeric value in the canonical base unit.
	 * @returns The converted value, or `undefined` if no conversion is registered.
	 */
	convertFromBase(
		anchor: MeasurementUnitAnchor,
		toUnit: string,
		value: number,
	): number | undefined {
		const entry = this.getConversion(anchor, toUnit);
		return entry ? entry.fromBase(value) : undefined;
	}

	/**
	 * Return the set of all registered unit anchors.
	 */
	getAnchors(): MeasurementUnitAnchor[] {
		return Array.from(this.anchors.keys());
	}

	/**
	 * Return the set of registered unit strings for a given anchor.
	 */
	getUnits(anchor: MeasurementUnitAnchor): string[] {
		return Array.from(this.anchors.get(anchor)?.keys() ?? []);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton default instance, pre-populated with all known conversions.
// ─────────────────────────────────────────────────────────────────────────────

let defaultInstance: UnitConversionRegistry | undefined;

/**
 * Returns the singleton default conversion registry, creating it on first call.
 */
export function getDefaultConversionRegistry(): UnitConversionRegistry {
	if (!defaultInstance) {
		defaultInstance = new UnitConversionRegistry();
		defaultInstance.loadDefaults();
	}
	return defaultInstance;
}
