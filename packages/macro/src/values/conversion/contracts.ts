export type QuantityDimension = string;
export type UnitId = string;
export type UnitTransformKind = "multiplicative" | "affine" | "nonlinear";

export interface UnitTransform {
	kind: UnitTransformKind;
	toCanonical(value: number): number;
	fromCanonical(value: number): number;
}

export interface AtomicUnitDefinition {
	id: UnitId;
	dimension: QuantityDimension;
	canonicalUnit: UnitId;
	transform: UnitTransform;
	composable: boolean;
}

export interface UnitFactor {
	unitId: UnitId;
	exponent: number;
}

export interface UnitExpression {
	factors: readonly UnitFactor[];
}

export interface NormalizedUnitExpression extends UnitExpression {
	dimensionVector: Readonly<Record<QuantityDimension, number>>;
}
