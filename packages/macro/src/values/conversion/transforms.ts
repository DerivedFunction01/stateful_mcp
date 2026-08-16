import type { UnitTransform } from "./contracts";

export function multiplicativeTransform(factor: number): UnitTransform {
	if (!Number.isFinite(factor) || factor === 0)
		throw new Error("A multiplicative conversion factor must be finite and non-zero");
	return {
		kind: "multiplicative",
		toCanonical: (value) => value * factor,
		fromCanonical: (value) => value / factor,
	};
}

export function functionalTransform(
	toCanonical: (value: number) => number,
	fromCanonical: (value: number) => number,
	kind: Exclude<UnitTransform["kind"], "multiplicative"> = "nonlinear",
): UnitTransform {
	return { kind, toCanonical, fromCanonical };
}
