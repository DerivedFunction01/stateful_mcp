import type { UnitTransform } from "./contracts";

export function multiplicativeTransform(factor: number): UnitTransform {
	if (!Number.isFinite(factor) || factor === 0)
		throw new Error("A multiplicative conversion factor must be finite and non-zero");
	return {
		kind: "multiplicative",
		toBase: (value) => value * factor,
		fromBase: (value) => value / factor,
	};
}

export function functionalTransform(
	toBase: (value: number) => number,
	fromBase: (value: number) => number,
	kind: Exclude<UnitTransform["kind"], "multiplicative"> = "nonlinear",
): UnitTransform {
	return { kind, toBase, fromBase };
}
