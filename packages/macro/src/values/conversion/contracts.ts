export type QuantityDimension = string;
export type UnitId = string;
export type UnitTransformKind = "multiplicative" | "affine" | "nonlinear";

export interface UnitTransform {
	kind: UnitTransformKind;
	toBase(value: number): number;
	fromBase(value: number): number;
}

export interface AtomicUnitDefinition {
	id: UnitId;
	dimension: QuantityDimension;
	canonicalUnit: UnitId;
	baseUnit?: UnitId;
	transform: UnitTransform;
	composable: boolean;
	baseDimensionVector?: Readonly<Record<string, number>>;
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
	baseDimensionVector?: Readonly<Record<string, number>>;
}
