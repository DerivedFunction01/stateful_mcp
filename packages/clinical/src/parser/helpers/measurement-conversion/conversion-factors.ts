/**
 * Conversion factor definitions organised by unit anchor.
 *
 * Each anchor exports its canonical base unit and a map of from-unit → factor
 * or function used by the registry.  Functions handle non‑linear conversions
 * (temperature); simple multiplicative factors are stored as numbers.
 *
 * Metric‑to‑metric conversions are exact powers of 10.  Imperial and other
 * non‑SI values use standard published conversion factors (CODATA / NIST).
 */

import type { MeasurementUnitAnchor } from "../../../schemas/measurement";

/**
 * Normalizes a measurement magnitude to its canonical base unit.
 * Returns null if the anchor or unit is unrecognized.
 */
export function normalizeMeasurementValue(
	anchor: MeasurementUnitAnchor,
	unit: string,
	magnitude: number,
): number | null {
	const table = ANCHOR_TO_CONVERSIONS[anchor];
	if (!table) return null;
	const conversion = table[unit];
	if (!conversion) return null;
	return conversion.toBase(magnitude);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper types
// ─────────────────────────────────────────────────────────────────────────────

/** A conversion expressed as a single multiply/divide factor. */
export function factor(f: number): {
	toBase: (v: number) => number;
	fromBase: (v: number) => number;
} {
	return {
		toBase: (v: number) => v * f,
		fromBase: (v: number) => v / f,
	};
}

/** A conversion expressed as an arbitrary pair of functions (e.g. temperature). */
export function fnc(
	toBase: (v: number) => number,
	fromBase: (v: number) => number,
): { toBase: (v: number) => number; fromBase: (v: number) => number } {
	return { toBase, fromBase };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per‑anchor conversion maps
// ─────────────────────────────────────────────────────────────────────────────

// The canonical base unit for each anchor is documented as a comment on the
// first line of every map.

/** Canonical base: metre (m) */
export const LENGTH_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	km: factor(1_000),
	m: factor(1), // already base
	cm: factor(1 / 100),
	mm: factor(1 / 1_000),
	um: factor(1 / 1_000_000),
	nm: factor(1 / 1_000_000_000),
	in: factor(0.0254),
	"[in_i]": factor(0.0254), // US survey inch ≡ 0.0254 m exactly
	ft: factor(0.3048),
	"[ft_i]": factor(0.3048),
	yd: factor(0.9144),
	mi: factor(1_609.344),
};

/** Canonical base: kilogram (kg) */
export const MASS_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	kg: factor(1), // already base
	g: factor(1 / 1_000),
	mg: factor(1 / 1_000_000),
	mcg: factor(1 / 1_000_000_000),
	ug: factor(1 / 1_000_000_000),
	ng: factor(1 / 1_000_000_000_000),
	pg: factor(1 / 1_000_000_000_000_000),
	lb: factor(0.45359237),
	oz: factor(0.028349523125),
	t: factor(1_000), // metric tonne
	ton: factor(907.18474), // short ton (US)
};

/** Canonical base: day (d) — clinical durations are human-scale in days.
 *
 * Keys match the `targetValue` strings emitted by the parser's time_unit rules
 * (e.g. `"second"`, `"minute"`, `"hour"`, `"day"`, `"week"`, `"month"`,
 * `"year"`, `"quarter"`, `"decade"`).  The `TimePrecisionLevel` union in
 * `schemas/time.ts` is the authoritative list.
 */
export const TIME_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	second: factor(1 / 86_400),
	minute: factor(1 / 1_440),
	hour: factor(1 / 24),
	day: factor(1),
	week: factor(7),
	month: factor(30.436875), // 1 solar month ≈ 30.436875 days
	quarter: factor(91.310625), // 3 solar months
	year: factor(365.2425), // 1 solar year  ≈ 365.2425 days
	decade: factor(3_652.425), // 10 solar years
};

/** Canonical base: Kelvin (K) */
export const TEMPERATURE_CONVERSIONS: Record<string, ReturnType<typeof fnc>> = {
	Kelvin: fnc(
		(v) => v, // already base
		(v) => v,
	),
	Celsius: fnc(
		(v) => v + 273.15,
		(v) => v - 273.15,
	),
	Fahrenheit: fnc(
		(v) => (v - 32) * (5 / 9) + 273.15,
		(v) => (v - 273.15) * (9 / 5) + 32,
	),
};

/** Canonical base: pascal (Pa) */
export const PRESSURE_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	Pa: factor(1), // already base
	kPa: factor(1_000),
	mmHg: factor(133.322387415), // 1 mmHg = 133.322 Pa (standard)
	bar: factor(100_000),
	atm: factor(101_325),
	psi: factor(6_894.757293168),
};

/** Canonical base: litre (L) */
export const VOLUME_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	L: factor(1),
	l: factor(1),
	dL: factor(1 / 10),
	dl: factor(1 / 10),
	mL: factor(1 / 1_000),
	ml: factor(1 / 1_000),
	uL: factor(1 / 1_000_000),
	ul: factor(1 / 1_000_000),
	cc: factor(1 / 1_000), // 1 cc ≡ 1 mL
	fl_oz: factor(0.0295735295625), // US fl oz
	tsp: factor(0.00492892159375),
	tbsp: factor(0.01478676478125),
	qt: factor(0.946352946),
	pt: factor(0.473176473),
	pint: factor(0.473176473),
	quart: factor(0.946352946),
	gal: factor(3.785411784),
	gallon: factor(3.785411784),
	cup: factor(0.2365882365),
};

/** Canonical base: joule (J) */
export const ENERGY_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	J: factor(1),
	kJ: factor(1_000),
	cal: factor(4.184),
	kcal: factor(4_184),
	kWh: factor(3_600_000), // 1 kWh = 3.6 MJ
};

/** Canonical base: newton (N) */
export const FORCE_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	N: factor(1),
	kN: factor(1_000),
	mN: factor(1 / 1_000),
	kgf: factor(9.80665), // standard gravity
	lbf: factor(4.4482216152605),
};

/** Canonical base: m/s */
export const VELOCITY_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	"m/s": factor(1),
	"cm/s": factor(1 / 100),
	"km/h": factor(1 / 3.6),
	mph: factor(0.44704),
};

/** Canonical base: m/s² */
export const ACCELERATION_CONVERSIONS: Record<
	string,
	ReturnType<typeof factor>
> = {
	"m/s2": factor(1),
	"m/s²": factor(1),
	g: factor(9.80665), // standard gravity
};

/** Canonical base: count (dimensionless) — identity. */
export const NUMBER_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	count: factor(1),
	cells: factor(1),
	elements: factor(1),
	copies: factor(1),
	IU: factor(1),
	U: factor(1),
	"IU/mL": factor(1), // concentration rate stored as-is
	"U/mL": factor(1),
	tablet: factor(1),
	capsule: factor(1),
	puff: factor(1),
	spray: factor(1),
	drop: factor(1),
	dose: factor(1),
	pill: factor(1),
	vial: factor(1),
	patch: factor(1),
	caplet: factor(1),
	sachet: factor(1),
};

/** Canonical base: kg/m³ (derived — stored as g/L → 1 g/L = 1 kg/m³) */
export const MASS_CONCENTRATION_CONVERSIONS: Record<
	string,
	ReturnType<typeof factor>
> = {
	"g/L": factor(1), // 1 g/L ≡ 1 kg/m³
	"g/l": factor(1),
	"g/dL": factor(10), // 1 g/dL = 10 g/L
	"g/mL": factor(1_000),
	"g/ml": factor(1_000),
	"g/uL": factor(1_000_000),
	"g/ul": factor(1_000_000),
	"mg/L": factor(1 / 1_000), // 1 mg/L = 0.001 kg/m³
	"mg/l": factor(1 / 1_000),
	"mg/dL": factor(1 / 100), // 1 mg/dL = 0.01 g/L
	"mg/mL": factor(1), // 1 mg/mL = 1 g/L
	"mg/ml": factor(1),
	"mg/uL": factor(1_000),
	"mg/ul": factor(1_000),
	"mcg/L": factor(1 / 1_000_000),
	"mcg/l": factor(1 / 1_000_000),
	"mcg/dL": factor(1 / 100_000),
	"mcg/mL": factor(1 / 1_000),
	"mcg/ml": factor(1 / 1_000),
	"mcg/uL": factor(1),
	"mcg/ul": factor(1),
	"ug/L": factor(1 / 1_000_000),
	"ug/l": factor(1 / 1_000_000),
	"ug/dL": factor(1 / 100_000),
	"ug/mL": factor(1 / 1_000),
	"ug/ml": factor(1 / 1_000),
	"ug/uL": factor(1),
	"ug/ul": factor(1),
	"ng/L": factor(1 / 1_000_000_000),
	"ng/l": factor(1 / 1_000_000_000),
	"ng/dL": factor(1 / 100_000_000),
	"ng/mL": factor(1 / 1_000_000),
	"ng/ml": factor(1 / 1_000_000),
	"ng/uL": factor(1 / 1_000),
	"ng/ul": factor(1 / 1_000),
	"pg/L": factor(1 / 1_000_000_000_000),
	"pg/l": factor(1 / 1_000_000_000_000),
	"pg/dL": factor(1 / 100_000_000_000),
	"pg/mL": factor(1 / 1_000_000_000),
	"pg/ml": factor(1 / 1_000_000_000),
	"pg/uL": factor(1 / 1_000_000),
	"pg/ul": factor(1 / 1_000_000),
};

/** Canonical base: mol/L */
export const SUBSTANCE_CONCENTRATION_CONVERSIONS: Record<
	string,
	ReturnType<typeof factor>
> = {
	"mol/L": factor(1),
	"mmol/L": factor(1 / 1_000),
	"umol/L": factor(1 / 1_000_000),
	"nmol/L": factor(1 / 1_000_000_000),
	"mEq/L": factor(1), // mEq/L is equivalent to mmol/L for monovalent ions
};

/** Canonical base: Osm/kg */
export const OSMOLALITY_CONVERSIONS: Record<
	string,
	ReturnType<typeof factor>
> = {
	"Osm/kg": factor(1),
	"mOsm/kg": factor(1 / 1_000),
};

/** Canonical base: Osm/L */
export const OSMOLARITY_CONVERSIONS: Record<
	string,
	ReturnType<typeof factor>
> = {
	"Osm/L": factor(1),
	"mOsm/L": factor(1 / 1_000),
};

/** Canonical base: katal (kat) */
export const CATALYTIC_ACTIVITY_CONVERSIONS: Record<
	string,
	ReturnType<typeof factor>
> = {
	kat: factor(1),
	mkat: factor(1 / 1_000),
	ukat: factor(1 / 1_000_000),
	nkat: factor(1 / 1_000_000_000),
	U: factor(1 / 60_000_000), // 1 U = 1 µmol/min ≈ 1.667×10⁻⁸ kat
};

/** Canonical base: ratio (0–1) */
export const FRACTION_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	"1": factor(1),
	fraction: factor(1),
	ratio: factor(1),
	"%": factor(1 / 100),
};

/** Canonical base: volt (V) */
export const ELECTRIC_POTENTIAL_CONVERSIONS: Record<
	string,
	ReturnType<typeof factor>
> = {
	V: factor(1),
	mV: factor(1 / 1_000),
	uV: factor(1 / 1_000_000),
};

/** Canonical base: ampere (A) */
export const ELECTRIC_CURRENT_CONVERSIONS: Record<
	string,
	ReturnType<typeof factor>
> = {
	A: factor(1),
	mA: factor(1 / 1_000),
	uA: factor(1 / 1_000_000),
};

/** Canonical base: watt (W) */
export const POWER_CONVERSIONS: Record<string, ReturnType<typeof factor>> = {
	W: factor(1),
	mW: factor(1 / 1_000),
	kW: factor(1_000),
};

/** Canonical base: dimensionless (score, points, etc.) — identity. */
export const ARBITRARY_CONVERSIONS: Record<
	string,
	ReturnType<typeof factor>
> = {
	"%": factor(1),
	percent: factor(1),
	score: factor(1),
	points: factor(1),
	ratio: factor(1),
	MET: factor(1),
};

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate lookup — maps each anchor to its conversion table
// ─────────────────────────────────────────────────────────────────────────────

export type ConversionTable = Record<
	string,
	{ toBase: (v: number) => number; fromBase: (v: number) => number }
>;

type AnchorMap = Partial<Record<MeasurementUnitAnchor, ConversionTable>>;

export const ANCHOR_TO_CONVERSIONS: AnchorMap = {
	length: LENGTH_CONVERSIONS,
	mass: MASS_CONVERSIONS,
	time: TIME_CONVERSIONS,
	temperature: TEMPERATURE_CONVERSIONS,
	pressure: PRESSURE_CONVERSIONS,
	volume: VOLUME_CONVERSIONS,
	energy: ENERGY_CONVERSIONS,
	force: FORCE_CONVERSIONS,
	velocity: VELOCITY_CONVERSIONS,
	acceleration: ACCELERATION_CONVERSIONS,
	number: NUMBER_CONVERSIONS,
	mass_concentration: MASS_CONCENTRATION_CONVERSIONS,
	substance_concentration: SUBSTANCE_CONCENTRATION_CONVERSIONS,
	osmolality: OSMOLALITY_CONVERSIONS,
	osmolarity: OSMOLARITY_CONVERSIONS,
	catalytic_activity: CATALYTIC_ACTIVITY_CONVERSIONS,
	fraction: FRACTION_CONVERSIONS,
	electric_potential: ELECTRIC_POTENTIAL_CONVERSIONS,
	electric_current: ELECTRIC_CURRENT_CONVERSIONS,
	power: POWER_CONVERSIONS,
	arbitrary: ARBITRARY_CONVERSIONS,
};
