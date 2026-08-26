import type { AtomicUnitDefinition } from "../../contracts";
import { functionalTransform, multiplicativeTransform } from "../../transforms";

export interface StandardUnit extends AtomicUnitDefinition {
	bundle: "si" | "us-customary" | "imperial";
}

export const LENGTH_VECTOR: Readonly<Record<string, number>> = { length: 1 };
export const MASS_VECTOR: Readonly<Record<string, number>> = { mass: 1 };
export const VOLUME_VECTOR: Readonly<Record<string, number>> = { length: 3 };
export const TIME_VECTOR: Readonly<Record<string, number>> = { time: 1 };
export const TEMPERATURE_VECTOR: Readonly<Record<string, number>> = {
	temperature: 1,
};
export const PRESSURE_VECTOR: Readonly<Record<string, number>> = {
	mass: 1,
	length: -1,
	time: -2,
};
export const FORCE_VECTOR: Readonly<Record<string, number>> = {
	mass: 1,
	length: 1,
	time: -2,
};
export const ENERGY_VECTOR: Readonly<Record<string, number>> = {
	mass: 1,
	length: 2,
	time: -2,
};
export const POWER_VECTOR: Readonly<Record<string, number>> = {
	mass: 1,
	length: 2,
	time: -3,
};
export const FREQUENCY_VECTOR: Readonly<Record<string, number>> = { time: -1 };

export const standard = (
	unit: Omit<StandardUnit, "transform"> & { factor: number },
): StandardUnit => ({
	...unit,
	transform: multiplicativeTransform(unit.factor),
});

export const affine = (
	unit: Omit<StandardUnit, "transform"> & {
		toBase: (value: number) => number;
		fromBase: (value: number) => number;
	},
): StandardUnit => ({
	...unit,
	transform: functionalTransform(unit.toBase, unit.fromBase, "affine"),
});
