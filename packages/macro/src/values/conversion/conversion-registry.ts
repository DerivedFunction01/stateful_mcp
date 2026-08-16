import type {
	AtomicUnitDefinition,
	NormalizedUnitExpression,
	QuantityDimension,
	UnitExpression,
	UnitId,
} from "./contracts";

export class QuantityConversionRegistry {
	private readonly dimensions = new Map<
		QuantityDimension,
		Map<UnitId, AtomicUnitDefinition>
	>();
	private readonly units = new Map<UnitId, AtomicUnitDefinition>();
	private readonly canonicalUnits = new Map<QuantityDimension, UnitId>();

	registerUnit(unit: AtomicUnitDefinition): void {
		if (!unit.id || !unit.dimension || !unit.canonicalUnit)
			throw new Error("A unit requires an ID, dimension, and canonical unit");
		const existing = this.units.get(unit.id);
		if (existing && existing.dimension !== unit.dimension) {
			throw new Error(
				`Unit '${unit.id}' is already registered for dimension '${existing.dimension}'`,
			);
		}
		const canonicalUnit = this.canonicalUnits.get(unit.dimension);
		if (canonicalUnit && canonicalUnit !== unit.canonicalUnit) {
			throw new Error(
				`Dimension '${unit.dimension}' already uses canonical unit '${canonicalUnit}'`,
			);
		}
		this.canonicalUnits.set(unit.dimension, unit.canonicalUnit);
		const stored = Object.freeze({
			...unit,
			transform: Object.freeze({ ...unit.transform }),
		});
		let dimensionUnits = this.dimensions.get(unit.dimension);
		if (!dimensionUnits) {
			dimensionUnits = new Map();
			this.dimensions.set(unit.dimension, dimensionUnits);
		}
		dimensionUnits.set(unit.id, stored);
		this.units.set(unit.id, stored);
	}

	getUnit(unitId: UnitId): AtomicUnitDefinition | undefined {
		return this.units.get(unitId);
	}

	get(
		dimension: QuantityDimension,
		sourceUnit: UnitId,
	): AtomicUnitDefinition | undefined {
		return this.dimensions.get(dimension)?.get(sourceUnit);
	}

	convertToCanonical(
		dimension: QuantityDimension,
		sourceUnit: UnitId,
		value: number,
	): number | undefined {
		if (!Number.isFinite(value)) return undefined;
		const unit = this.get(dimension, sourceUnit);
		if (!unit) return undefined;
		const converted = unit.transform.toCanonical(value);
		return Number.isFinite(converted) ? converted : undefined;
	}

	convertFromCanonical(
		dimension: QuantityDimension,
		targetUnit: UnitId,
		value: number,
	): number | undefined {
		if (!Number.isFinite(value)) return undefined;
		const unit = this.get(dimension, targetUnit);
		if (!unit) return undefined;
		const converted = unit.transform.fromCanonical(value);
		return Number.isFinite(converted) ? converted : undefined;
	}

	convert(
		source: UnitExpression,
		target: UnitExpression,
		value: number,
	): number | undefined {
		if (!Number.isFinite(value)) return undefined;
		const sourceExpression = this.normalize(source);
		const targetExpression = this.normalize(target);
		if (!sameDimensionVector(sourceExpression, targetExpression)) return undefined;
		const sourceScale = this.expressionScale(sourceExpression);
		const targetScale = this.expressionScale(targetExpression);
		if (sourceScale === undefined || targetScale === undefined) return undefined;
		const converted = (value * sourceScale) / targetScale;
		return Number.isFinite(converted) ? converted : undefined;
	}

	getDimensions(): readonly QuantityDimension[] {
		return [...this.dimensions.keys()].sort();
	}

	getUnits(dimension: QuantityDimension): readonly UnitId[] {
		return [...(this.dimensions.get(dimension)?.keys() ?? [])].sort();
	}

	normalize(expression: UnitExpression): NormalizedUnitExpression {
		const exponents = new Map<UnitId, number>();
		for (const factor of expression.factors) {
			if (!Number.isInteger(factor.exponent))
				throw new Error(`Unit exponent must be an integer: ${factor.unitId}`);
			if (factor.exponent === 0) continue;
			exponents.set(
				factor.unitId,
				(exponents.get(factor.unitId) ?? 0) + factor.exponent,
			);
		}
		const factors = [...exponents.entries()]
			.filter(([, exponent]) => exponent !== 0)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([unitId, exponent]) => ({ unitId, exponent }));
		const dimensionVector: Record<string, number> = {};
		for (const factor of factors) {
			const unit = this.getUnit(factor.unitId);
			if (!unit) continue;
			dimensionVector[unit.dimension] =
				(dimensionVector[unit.dimension] ?? 0) + factor.exponent;
		}
		return { factors, dimensionVector };
	}

	private expressionScale(expression: NormalizedUnitExpression): number | undefined {
		let scale = 1;
		for (const factor of expression.factors) {
			const unit = this.getUnit(factor.unitId);
			if (
				!unit ||
				!unit.composable ||
				unit.transform.kind !== "multiplicative"
			)
				return undefined;
			const unitScale = unit.transform.toCanonical(1);
			if (!Number.isFinite(unitScale) || unitScale === 0) return undefined;
			scale *= unitScale ** factor.exponent;
		}
		return Number.isFinite(scale) ? scale : undefined;
	}
}

function sameDimensionVector(
	left: NormalizedUnitExpression,
	right: NormalizedUnitExpression,
): boolean {
	const dimensions = new Set([
		...Object.keys(left.dimensionVector),
		...Object.keys(right.dimensionVector),
	]);
	for (const dimension of dimensions) {
		if (
			(left.dimensionVector[dimension] ?? 0) !==
			(right.dimensionVector[dimension] ?? 0)
		)
			return false;
	}
	return true;
}
