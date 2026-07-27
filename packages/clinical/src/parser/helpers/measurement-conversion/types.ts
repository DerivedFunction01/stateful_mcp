export type MeasurementUnitAnchor =
	| "length"
	| "mass"
	| "time"
	| "temperature"
	| "velocity"
	| "acceleration"
	| "volume"
	| "area"
	| "force"
	| "pressure"
	| "energy"
	| "concentration"
	| "mass_concentration"
	| "substance_concentration"
	| "mass_fraction"
	| "fraction"
	| "osmolality"
	| "osmolarity"
	| "catalytic_activity"
	| "number"
	| "arbitrary"
	| "dynamic_viscosity"
	| "power"
	| "power_level"
	| "pressure_level"
	| "electric_current"
	| "electric_potential"
	| "magnetic_flux_density";

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