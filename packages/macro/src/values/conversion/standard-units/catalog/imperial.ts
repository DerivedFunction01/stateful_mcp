import { type StandardUnit, standard, VOLUME_VECTOR } from "./factory";

export function imperialUnits(): StandardUnit[] {
	return [
		standard({
			id: "[gal_br]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "imperial",
			factor: 0.00454609,
		}),
		standard({
			id: "[qt_br]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "imperial",
			factor: 0.0011365225,
		}),
		standard({
			id: "[pt_br]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "imperial",
			factor: 0.00056826125,
		}),
		standard({
			id: "[foz_br]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "imperial",
			factor: 0.0000284130625,
		}),
	];
}
