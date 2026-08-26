import type { QuantityConversionRegistry } from "../conversion/conversion-registry";

export interface QuantitySegment {
	readonly value: number;
	readonly unit: string;
	readonly canonicalValue: number;
}

export type MultiUnitCanonicalTarget = "base" | "primary" | "discrete" | string;

export interface ChainedQuantityResult {
	readonly kind: "quantity";
	readonly magnitude: number;
	readonly unit: string;
	readonly dimension: string;
	readonly chain: readonly QuantitySegment[];
	readonly rawText: string;
}

/**
 * Decomposes a single canonical scalar amount into an ordered multi-unit chain via greedy modulus reduction.
 * Target units are automatically sorted by descending magnitude in the conversion graph.
 */
export function decomposeScalarToChain(
	amount: number,
	sourceUnit: string,
	targetUnitIds: readonly string[],
	registry: QuantityConversionRegistry,
): QuantitySegment[] {
	if (!Number.isFinite(amount) || targetUnitIds.length === 0) return [];

	const sourceConversion = registry.convertToCanonicalByUnit(
		sourceUnit,
		amount,
	);
	if (!sourceConversion) return [];

	const baseAmount = sourceConversion.canonicalAmount;
	const dimension = sourceConversion.dimension;

	// Resolve the base canonical value for 1.0 unit of each target unit to determine factor
	const targetUnitsWithFactors: Array<{ unitId: string; factor: number }> = [];
	for (const unitId of targetUnitIds) {
		const targetDef = registry.getUnit(unitId);
		if (!targetDef || targetDef.dimension !== dimension) continue;
		const oneUnitCanonical = registry.convertToCanonical(
			dimension,
			unitId,
			1.0,
		);
		if (oneUnitCanonical !== undefined && oneUnitCanonical > 0) {
			targetUnitsWithFactors.push({ unitId, factor: oneUnitCanonical });
		}
	}

	if (targetUnitsWithFactors.length === 0) return [];

	// Automatically sort descending by factor (largest unit first)
	targetUnitsWithFactors.sort((left, right) => right.factor - left.factor);

	let remaining = baseAmount;
	const chain: QuantitySegment[] = [];

	for (let i = 0; i < targetUnitsWithFactors.length; i++) {
		const { unitId, factor } = targetUnitsWithFactors[i]!;
		const isTerminal = i === targetUnitsWithFactors.length - 1;

		if (isTerminal) {
			const count = Math.round((remaining / factor) * 1e6) / 1e6;
			if (count > 0 || chain.length === 0) {
				chain.push({
					unit: unitId,
					value: count,
					canonicalValue: count * factor,
				});
			}
		} else {
			const count = Math.floor((remaining + 1e-9) / factor);
			if (count > 0) {
				chain.push({
					unit: unitId,
					value: count,
					canonicalValue: count * factor,
				});
				remaining -= count * factor;
			}
		}
	}

	return chain;
}
