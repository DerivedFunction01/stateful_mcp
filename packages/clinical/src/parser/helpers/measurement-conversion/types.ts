import type { MeasurementUnitAnchor } from "../../../schemas/measurement";

export interface ConversionEntry {
	fromUnit: string;
	toBase: (value: number) => number;
	fromBase: (value: number) => number;
}

export interface UnitConverter {
	anchor: MeasurementUnitAnchor;
	entries: ConversionEntry[];
	convertToBase: (value: number, fromUnit: string) => number | undefined;
	convertFromBase: (value: number, toUnit: string) => number | undefined;
}

export interface ResolvedUnitWithBase {
	display: string;
	unitAnchor: MeasurementUnitAnchor;
	valueInBase?: number;
}
