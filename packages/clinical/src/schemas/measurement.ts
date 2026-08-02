import type { CodeableConcept } from "./shared";
import type { TimeUnit } from "./time";

export type TerrestrialUnitAnchor =
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
	| "energy";

export type PhysiologicalUnitAnchor =
	| "concentration"
	| "mass_concentration"
	| "substance_concentration"
	| "mass_fraction"
	| "fraction"
	| "osmolality"
	| "osmolarity"
	| "catalytic_activity"
	| "number"
	| "arbitrary";

export type EngineeringUnitAnchor =
	| "dynamic_viscosity"
	| "power"
	| "power_level"
	| "pressure_level"
	| "electric_current"
	| "electric_potential"
	| "magnetic_flux_density";

export type MeasurementUnitAnchor =
	| TerrestrialUnitAnchor
	| PhysiologicalUnitAnchor
	| EngineeringUnitAnchor;

export type MassUnit =
	| "kg"
	| "g"
	| "mg"
	| "mcg"
	| "ug"
	| "ng"
	| "pg"
	| "lb"
	| "oz"
	| "t"
	| "ton";
export type VolumeUnit =
	| "L"
	| "dL"
	| "mL"
	| "uL"
	| "fl_oz"
	| "tsp"
	| "tbsp"
	| "qt"
	| "pt"
	| "gal"
	| "cc"
	| "cup"
	| "pint"
	| "quart"
	| "gallon";
export type LengthUnit =
	| "km"
	| "m"
	| "cm"
	| "mm"
	| "um"
	| "nm"
	| "in"
	| "ft"
	| "[in_i]"
	| "[ft_i]"
	| "yd"
	| "mi";

export type TemperatureUnit = "Celsius" | "Fahrenheit" | "Kelvin";
export type PressureUnit = "mmHg" | "bar" | "atm" | "Pa" | "kPa" | "psi";
export type CountUnit =
	| "count"
	| "cells"
	| "elements"
	| "copies"
	| "IU"
	| "U"
	| "IU/mL"
	| "U/mL"
	| "tablet"
	| "capsule"
	| "puff"
	| "spray"
	| "drop"
	| "dose"
	| "pill"
	| "vial"
	| "patch"
	| "caplet"
	| "sachet"
	| "pack"
	| "drink"
	| "glass"
	| "shot"
	| "/min"
	| "breaths_per_min"
	| "beats_per_min";
export type ScoreUnit = "%" | "percent" | "score" | "points" | "ratio";

type ConcMassUnit = "g" | "mg" | "mcg" | "ug" | "ng" | "pg";
type ConcVolumeUnit = "L" | "dL" | "mL" | "uL";
export type MassConcentrationUnit =
	| `${ConcMassUnit}/${ConcVolumeUnit}`
	| "mg/mL"
	| "mg/dL"
	| "mcg/mL"
	| "g/L"
	| "g/dL";

export type SubstanceConcentrationUnit =
	| "mol/L"
	| "mmol/L"
	| "umol/L"
	| "nmol/L"
	| "mEq/L";
export type EnergyUnit = "cal" | "kcal" | "J" | "kJ" | "kWh";
export type ForceUnit = "N" | "kN" | "mN" | "kgf" | "lbf";
export type OsmolalityUnit = "Osm/kg" | "mOsm/kg";
export type OsmolarityUnit = "Osm/L" | "mOsm/L";
export type CatalyticActivityUnit = "U" | "kat" | "mkat" | "ukat" | "nkat";
export type FractionUnit = "%" | "fraction" | "ratio";
export type ElectricPotentialUnit = "V" | "mV" | "uV";
export type ElectricCurrentUnit = "A" | "mA" | "uA";
export type PowerUnit = "W" | "mW" | "kW";
export type VelocityUnit = "m/s" | "cm/s" | "km/h" | "mph";
export type AccelerationUnit = "m/s2" | "g";

export type AllowedUnit =
	| MassUnit
	| VolumeUnit
	| LengthUnit
	| TemperatureUnit
	| PressureUnit
	| CountUnit
	| ScoreUnit
	| MassConcentrationUnit
	| SubstanceConcentrationUnit
	| EnergyUnit
	| ForceUnit
	| OsmolalityUnit
	| OsmolarityUnit
	| CatalyticActivityUnit
	| FractionUnit
	| ElectricPotentialUnit
	| ElectricCurrentUnit
	| PowerUnit
	| VelocityUnit
	| AccelerationUnit;

export interface Statistics {
	min?: number;
	max?: number;
	mean?: number;
	stdev?: number;
	stdev_pop?: number;
	variance?: number;
	numerator?: number;
	denominator?: number;
	range?: number;
	rmse?: number;
	mae?: number;
	mse?: number;
	median?: number;
	margin_of_err?: number;
}

/**
 * Root of the measurement hierarchy.
 * Carries the raw numeric value plus optional operator, approximation flag,
 * and data-point count.  Used directly by the parser (which does not yet know
 * the physical dimension) and as the base for every typed sub-interface.
 */
export interface SingleMeasurement {
	magnitude: number;
	unit?: CodeableConcept;
	num_data_points?: number;
	operator?: "eq" | "gt" | "gte" | "lt" | "lte";
	is_approximate?: boolean;
	statistics?: Statistics;
}

/**
 * Extends SingleMeasurement by locking in a physical-dimension anchor.
 * Every domain-specific measurement sub-interface extends this.
 *
 * `valueInBase` is an optional canonical value in the metric base unit
 * (e.g. metres for length, pascals for pressure, kelvin for temperature).
 * It is computed at parse time by the measurement-conversion system and
 * cached alongside the original `magnitude` and `unit` for display.
 */
export interface BoundedMeasurement extends SingleMeasurement {
	unitAnchor: MeasurementUnitAnchor;
	valueInBase?: number;
}

export interface TemperatureMeasurement extends BoundedMeasurement {
	unitAnchor: "temperature";
	unit?: Omit<CodeableConcept, "display"> & { display: TemperatureUnit };
}

export interface PressureMeasurement extends BoundedMeasurement {
	unitAnchor: "pressure";
	unit?: Omit<CodeableConcept, "display"> & { display: PressureUnit };
}

export interface CountMeasurement extends BoundedMeasurement {
	unitAnchor: "number";
	unit?: Omit<CodeableConcept, "display"> & { display: CountUnit };
}

export interface DistanceMeasurement extends BoundedMeasurement {
	unitAnchor: "length";
	unit?: Omit<CodeableConcept, "display"> & { display: LengthUnit };
}

export interface MassMeasurement extends BoundedMeasurement {
	unitAnchor: "mass";
	unit?: Omit<CodeableConcept, "display"> & { display: MassUnit };
}

export interface MassConcentrationMeasurement extends BoundedMeasurement {
	unitAnchor: "mass_concentration";
	unit?: Omit<CodeableConcept, "display"> & { display: MassConcentrationUnit };
}

export interface EnergyMeasurement extends BoundedMeasurement {
	unitAnchor: "energy";
	unit?: Omit<CodeableConcept, "display"> & { display: EnergyUnit };
}

export interface ForceMeasurement extends BoundedMeasurement {
	unitAnchor: "force";
	unit?: Omit<CodeableConcept, "display"> & { display: ForceUnit };
}

export interface OsmolalityMeasurement extends BoundedMeasurement {
	unitAnchor: "osmolality";
	unit?: Omit<CodeableConcept, "display"> & { display: OsmolalityUnit };
}

export interface OsmolarityMeasurement extends BoundedMeasurement {
	unitAnchor: "osmolarity";
	unit?: Omit<CodeableConcept, "display"> & { display: OsmolarityUnit };
}

export interface CatalyticActivityMeasurement extends BoundedMeasurement {
	unitAnchor: "catalytic_activity";
	unit?: Omit<CodeableConcept, "display"> & { display: CatalyticActivityUnit };
}

export interface FractionMeasurement extends BoundedMeasurement {
	unitAnchor: "fraction";
	unit?: Omit<CodeableConcept, "display"> & { display: FractionUnit };
}

export interface ElectricPotentialMeasurement extends BoundedMeasurement {
	unitAnchor: "electric_potential";
	unit?: Omit<CodeableConcept, "display"> & { display: ElectricPotentialUnit };
}

export interface ElectricCurrentMeasurement extends BoundedMeasurement {
	unitAnchor: "electric_current";
	unit?: Omit<CodeableConcept, "display"> & { display: ElectricCurrentUnit };
}

export interface PowerMeasurement extends BoundedMeasurement {
	unitAnchor: "power";
	unit?: Omit<CodeableConcept, "display"> & { display: PowerUnit };
}

export interface VelocityMeasurement extends BoundedMeasurement {
	unitAnchor: "velocity";
	unit?: Omit<CodeableConcept, "display"> & { display: VelocityUnit };
}

export interface AccelerationMeasurement extends BoundedMeasurement {
	unitAnchor: "acceleration";
	unit?: Omit<CodeableConcept, "display"> & { display: AccelerationUnit };
}

/** Covers all pharmaceutical dosage forms: solid mass (mg, g) or liquid concentration (mg/mL). */
export type DosageMeasurement = MassMeasurement | MassConcentrationMeasurement;

/** Dimensionless score or ratio produced by an algorithmic evaluation. */
export interface ScoreMeasurement extends BoundedMeasurement {
	unitAnchor: "arbitrary";
	unit?: Omit<CodeableConcept, "display"> & { display: ScoreUnit };
}

/**
 * Type guard: narrows a SingleMeasurement to BoundedMeasurement when a
 * physical-dimension anchor was resolved during parsing.
 */
export function isBoundedMeasurement(
	m: SingleMeasurement,
): m is BoundedMeasurement {
	return (
		"unitAnchor" in m && (m as BoundedMeasurement).unitAnchor !== undefined
	);
}

export const UNIT_DISPLAY_MAP: Record<AllowedUnit | TimeUnit, string> = {
	// Mass
	kg: "kg",
	g: "g",
	mg: "mg",
	mcg: "mcg",
	ug: "mcg",
	ng: "ng",
	pg: "pg",
	lb: "lb",
	oz: "oz",
	t: "t",
	ton: "ton",

	// Volume
	L: "L",
	dL: "dL",
	mL: "mL",
	uL: "uL",
	fl_oz: "fl oz",
	tsp: "tsp",
	tbsp: "tbsp",
	qt: "qt",
	pt: "pt",
	gal: "gal",
	cc: "cc",
	cup: "cup",
	pint: "pint",
	quart: "quart",
	gallon: "gallon",

	// Length
	km: "km",
	m: "m",
	cm: "cm",
	mm: "mm",
	um: "um",
	nm: "nm",
	in: "in",
	ft: "ft",
	"[in_i]": "in",
	"[ft_i]": "ft",
	yd: "yd",
	mi: "mi",

	// Temperature
	Celsius: "°C",
	Fahrenheit: "°F",
	Kelvin: "K",

	// Pressure
	mmHg: "mmHg",
	bar: "bar",
	atm: "atm",
	Pa: "Pa",
	kPa: "kPa",
	psi: "psi",

	// Count
	count: "count",
	cells: "cells",
	elements: "elements",
	copies: "copies",
	IU: "IU",
	U: "U",
	"IU/mL": "IU/mL",
	"U/mL": "U/mL",
	tablet: "tablet",
	capsule: "capsule",
	puff: "puff",
	spray: "spray",
	drop: "drop",
	dose: "dose",
	pill: "pill",
	vial: "vial",
	patch: "patch",
	caplet: "caplet",
	sachet: "sachet",
	pack: "pack",
	drink: "drink",
	glass: "glass",
	shot: "shot",
	"/min": "/min",
	breaths_per_min: "bpm",
	beats_per_min: "bpm",

	// Score
	"%": "%",
	percent: "%",
	score: "score",
	points: "points",
	ratio: "ratio",

	// Mass Concentration permutations
	"g/L": "g/L",
	"g/dL": "g/dL",
	"g/mL": "g/mL",
	"g/uL": "g/uL",
	"mg/L": "mg/L",
	"mg/dL": "mg/dL",
	"mg/mL": "mg/mL",
	"mg/uL": "mg/uL",
	"mcg/L": "mcg/L",
	"mcg/dL": "mcg/dL",
	"mcg/mL": "mcg/mL",
	"mcg/uL": "mcg/uL",
	"ug/L": "ug/L",
	"ug/dL": "ug/dL",
	"ug/mL": "ug/mL",
	"ug/uL": "ug/uL",
	"ng/L": "ng/L",
	"ng/dL": "ng/dL",
	"ng/mL": "ng/mL",
	"ng/uL": "ng/uL",
	"pg/L": "pg/L",
	"pg/dL": "pg/dL",
	"pg/mL": "pg/mL",
	"pg/uL": "pg/uL",

	// Substance Concentration
	"mol/L": "mol/L",
	"mmol/L": "mmol/L",
	"umol/L": "umol/L",
	"nmol/L": "nmol/L",
	"mEq/L": "mEq/L",

	// Energy
	cal: "cal",
	kcal: "kcal",
	J: "J",
	kJ: "kJ",
	kWh: "kWh",

	// Force
	N: "N",
	kN: "kN",
	mN: "mN",
	kgf: "kgf",
	lbf: "lbf",

	// Osmolality / Osmolarity
	"Osm/kg": "Osm/kg",
	"mOsm/kg": "mOsm/kg",
	"Osm/L": "Osm/L",
	"mOsm/L": "mOsm/L",

	// Catalytic Activity
	kat: "kat",
	mkat: "mkat",
	ukat: "ukat",
	nkat: "nkat",

	// Fraction
	fraction: "fraction",

	// Electric Potential, Current, Power
	V: "V",
	mV: "mV",
	uV: "uV",
	A: "A",
	mA: "mA",
	uA: "uA",
	W: "W",
	mW: "mW",
	kW: "kW",

	// Velocity / Acceleration
	"m/s": "m/s",
	"cm/s": "cm/s",
	"km/h": "km/h",
	mph: "mph",
	"m/s2": "m/s²",
	second: "s",
	minute: "min",
	hour: "hr",
	day: "d",
	week: "wk",
	month: "mo",
	year: "yr",
};
