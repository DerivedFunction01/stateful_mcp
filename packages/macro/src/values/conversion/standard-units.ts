import type {
	AtomicUnitDefinition,
	QuantityDimension,
	UnitExpression,
	UnitId,
} from "./contracts";
import { QuantityConversionRegistry } from "./conversion-registry";
import { functionalTransform, multiplicativeTransform } from "./transforms";

export const STANDARD_UNIT_BUNDLES = [
	"si",
	"us-customary",
	"imperial",
] as const;

export type StandardUnitBundle = (typeof STANDARD_UNIT_BUNDLES)[number];

export interface CommonUnitCatalogOptions {
	dimensions?: readonly QuantityDimension[];
	bundles?: readonly StandardUnitBundle[];
	overrideExisting?: boolean;
	canonicalUnits?: Readonly<Record<QuantityDimension, UnitId>>;
	timeDefaults?: {
		weekSeconds?: number;
		monthSeconds?: number;
		yearSeconds?: number;
	};
}

export interface CommonUnitExpressions {
	"m/s": UnitExpression;
	"km/h": UnitExpression;
	"[mi_i]/h": UnitExpression;
	"[ft_i]/s": UnitExpression;
	"m/s2": UnitExpression;
	"km/h2": UnitExpression;
	"[ft_i]/s2": UnitExpression;
	m2: UnitExpression;
	cm2: UnitExpression;
	"L/min": UnitExpression;
	"mL/s": UnitExpression;
	"[gal_us]/min": UnitExpression;
	"kg/s": UnitExpression;
	"g/min": UnitExpression;
	"[lb_av]/h": UnitExpression;
}

interface StandardUnit extends AtomicUnitDefinition {
	bundle: "si" | "us-customary" | "imperial";
}

const LENGTH_VECTOR = { length: 1 };
const MASS_VECTOR = { mass: 1 };
const VOLUME_VECTOR = { length: 3 };
const TIME_VECTOR = { time: 1 };
const TEMPERATURE_VECTOR = { temperature: 1 };
const PRESSURE_VECTOR = { mass: 1, length: -1, time: -2 };
const FORCE_VECTOR = { mass: 1, length: 1, time: -2 };
const ENERGY_VECTOR = { mass: 1, length: 2, time: -2 };
const POWER_VECTOR = { mass: 1, length: 2, time: -3 };
const FREQUENCY_VECTOR = { time: -1 };

const standard = (
	unit: Omit<StandardUnit, "transform"> & { factor: number },
): StandardUnit => ({
	...unit,
	transform: multiplicativeTransform(unit.factor),
});

const affine = (
	unit: Omit<StandardUnit, "transform"> & {
		toBase: (value: number) => number;
		fromBase: (value: number) => number;
	},
): StandardUnit => ({
	...unit,
	transform: functionalTransform(unit.toBase, unit.fromBase, "affine"),
});

function timeUnits(options: CommonUnitCatalogOptions): StandardUnit[] {
	const weekSeconds = options.timeDefaults?.weekSeconds ?? 7 * 86_400;
	const monthSeconds = options.timeDefaults?.monthSeconds ?? 30.436875 * 86_400;
	const yearSeconds = options.timeDefaults?.yearSeconds ?? 365.2425 * 86_400;
	for (const [name, value] of Object.entries({
		weekSeconds,
		monthSeconds,
		yearSeconds,
	})) {
		if (!Number.isFinite(value) || value <= 0)
			throw new Error(`${name} must be a finite positive number`);
	}
	return [
		standard({
			id: "s",
			dimension: "time",
			canonicalUnit: "d",
			baseUnit: "s",
			baseDimensionVector: TIME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
		standard({
			id: "min",
			dimension: "time",
			canonicalUnit: "d",
			baseUnit: "s",
			baseDimensionVector: TIME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 60,
		}),
		standard({
			id: "h",
			dimension: "time",
			canonicalUnit: "d",
			baseUnit: "s",
			baseDimensionVector: TIME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 3_600,
		}),
		standard({
			id: "d",
			dimension: "time",
			canonicalUnit: "d",
			baseUnit: "s",
			baseDimensionVector: TIME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 86_400,
		}),
		standard({
			id: "wk",
			dimension: "time",
			canonicalUnit: "d",
			baseUnit: "s",
			baseDimensionVector: TIME_VECTOR,
			composable: true,
			bundle: "si",
			factor: weekSeconds,
		}),
		standard({
			id: "mo",
			dimension: "time",
			canonicalUnit: "d",
			baseUnit: "s",
			baseDimensionVector: TIME_VECTOR,
			composable: true,
			bundle: "si",
			factor: monthSeconds,
		}),
		standard({
			id: "a",
			dimension: "time",
			canonicalUnit: "d",
			baseUnit: "s",
			baseDimensionVector: TIME_VECTOR,
			composable: true,
			bundle: "si",
			factor: yearSeconds,
		}),
	];
}

function units(options: CommonUnitCatalogOptions): StandardUnit[] {
	return [
		standard({
			id: "m",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
		standard({
			id: "km",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1_000,
		}),
		standard({
			id: "cm",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "si",
			factor: 0.01,
		}),
		standard({
			id: "mm",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "si",
			factor: 0.001,
		}),
		standard({
			id: "um",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1e-6,
		}),
		standard({
			id: "nm",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1e-9,
		}),
		standard({
			id: "[in_i]",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.0254,
		}),
		standard({
			id: "[ft_i]",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.3048,
		}),
		standard({
			id: "[yd_i]",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.9144,
		}),
		standard({
			id: "[mi_i]",
			dimension: "length",
			canonicalUnit: "m",
			baseDimensionVector: LENGTH_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 1_609.344,
		}),
		standard({
			id: "kg",
			dimension: "mass",
			canonicalUnit: "kg",
			baseDimensionVector: MASS_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
		standard({
			id: "g",
			dimension: "mass",
			canonicalUnit: "kg",
			baseDimensionVector: MASS_VECTOR,
			composable: true,
			bundle: "si",
			factor: 0.001,
		}),
		standard({
			id: "mg",
			dimension: "mass",
			canonicalUnit: "kg",
			baseDimensionVector: MASS_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1e-6,
		}),
		standard({
			id: "ug",
			dimension: "mass",
			canonicalUnit: "kg",
			baseDimensionVector: MASS_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1e-9,
		}),
		standard({
			id: "ng",
			dimension: "mass",
			canonicalUnit: "kg",
			baseDimensionVector: MASS_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1e-12,
		}),
		standard({
			id: "[lb_av]",
			dimension: "mass",
			canonicalUnit: "kg",
			baseDimensionVector: MASS_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.45359237,
		}),
		standard({
			id: "[oz_av]",
			dimension: "mass",
			canonicalUnit: "kg",
			baseDimensionVector: MASS_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.028349523125,
		}),
		standard({
			id: "m3",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
		standard({
			id: "L",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 0.001,
		}),
		standard({
			id: "dL",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 0.0001,
		}),
		standard({
			id: "mL",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1e-6,
		}),
		standard({
			id: "uL",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1e-9,
		}),
		standard({
			id: "[gal_us]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.003785411784,
		}),
		standard({
			id: "[qt_us]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.000946352946,
		}),
		standard({
			id: "[pt_us]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.000473176473,
		}),
		standard({
			id: "[foz_us]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.0000295735295625,
		}),
		standard({
			id: "[cup_us]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.0002365882365,
		}),
		standard({
			id: "[tbsp_us]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.00001478676478125,
		}),
		standard({
			id: "[tsp_us]",
			dimension: "volume",
			canonicalUnit: "L",
			baseUnit: "m3",
			baseDimensionVector: VOLUME_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 0.00000492892159375,
		}),
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
		standard({
			id: "s",
			dimension: "time",
			canonicalUnit: "d",
			baseUnit: "s",
			baseDimensionVector: TIME_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
		...timeUnits(options).filter((unit) => unit.id !== "s"),
		affine({
			id: "K",
			dimension: "temperature",
			canonicalUnit: "K",
			baseDimensionVector: TEMPERATURE_VECTOR,
			composable: false,
			bundle: "si",
			toBase: (value) => value,
			fromBase: (value) => value,
		}),
		affine({
			id: "Cel",
			dimension: "temperature",
			canonicalUnit: "K",
			baseDimensionVector: TEMPERATURE_VECTOR,
			composable: false,
			bundle: "si",
			toBase: (value) => value + 273.15,
			fromBase: (value) => value - 273.15,
		}),
		affine({
			id: "[degF]",
			dimension: "temperature",
			canonicalUnit: "K",
			baseDimensionVector: TEMPERATURE_VECTOR,
			composable: false,
			bundle: "us-customary",
			toBase: (value) => (value - 32) * (5 / 9) + 273.15,
			fromBase: (value) => (value - 273.15) * (9 / 5) + 32,
		}),
		standard({
			id: "Pa",
			dimension: "pressure",
			canonicalUnit: "Pa",
			baseDimensionVector: PRESSURE_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
		standard({
			id: "kPa",
			dimension: "pressure",
			canonicalUnit: "Pa",
			baseDimensionVector: PRESSURE_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1_000,
		}),
		standard({
			id: "bar",
			dimension: "pressure",
			canonicalUnit: "Pa",
			baseDimensionVector: PRESSURE_VECTOR,
			composable: true,
			bundle: "si",
			factor: 100_000,
		}),
		standard({
			id: "mm[Hg]",
			dimension: "pressure",
			canonicalUnit: "Pa",
			baseDimensionVector: PRESSURE_VECTOR,
			composable: true,
			bundle: "si",
			factor: 133.322387415,
		}),
		standard({
			id: "[psi]",
			dimension: "pressure",
			canonicalUnit: "Pa",
			baseDimensionVector: PRESSURE_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 6_894.757293168,
		}),
		standard({
			id: "N",
			dimension: "force",
			canonicalUnit: "N",
			baseDimensionVector: FORCE_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
		standard({
			id: "[lbf_av]",
			dimension: "force",
			canonicalUnit: "N",
			baseDimensionVector: FORCE_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 4.4482216152605,
		}),
		standard({
			id: "J",
			dimension: "energy",
			canonicalUnit: "J",
			baseDimensionVector: ENERGY_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
		standard({
			id: "[Btu]",
			dimension: "energy",
			canonicalUnit: "J",
			baseDimensionVector: ENERGY_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 1_055.05585262,
		}),
		standard({
			id: "[cal_IT]",
			dimension: "energy",
			canonicalUnit: "J",
			baseDimensionVector: ENERGY_VECTOR,
			composable: true,
			bundle: "si",
			factor: 4.1868,
		}),
		standard({
			id: "W",
			dimension: "power",
			canonicalUnit: "W",
			baseDimensionVector: POWER_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
		standard({
			id: "[hp]",
			dimension: "power",
			canonicalUnit: "W",
			baseDimensionVector: POWER_VECTOR,
			composable: true,
			bundle: "us-customary",
			factor: 745.699871582,
		}),
		standard({
			id: "Hz",
			dimension: "frequency",
			canonicalUnit: "Hz",
			baseDimensionVector: FREQUENCY_VECTOR,
			composable: true,
			bundle: "si",
			factor: 1,
		}),
	];
}

export function registerCommonUnits(
	registry: QuantityConversionRegistry,
	options: CommonUnitCatalogOptions = {},
): void {
	const bundles = new Set(
		options.bundles ?? ["si", "us-customary", "imperial"],
	);
	const dimensions = options.dimensions
		? new Set(options.dimensions)
		: undefined;
	const catalog = units(options);
	const selected = new Set<string>();
	const byId = new Map(catalog.map((unit) => [unit.id, unit]));
	const visit = (unit: StandardUnit): void => {
		if (selected.has(unit.id)) return;
		selected.add(unit.id);
		const canonicalId =
			options.canonicalUnits?.[unit.dimension] ?? unit.canonicalUnit;
		const canonical = byId.get(canonicalId);
		if (canonical) visit(canonical);
		if (unit.baseUnit) {
			const base = byId.get(unit.baseUnit);
			if (base) visit(base);
		}
	};
	for (const unit of catalog) {
		if (
			bundles.has(unit.bundle) &&
			(!dimensions || dimensions.has(unit.dimension))
		)
			visit(unit);
	}
	for (const unit of catalog) {
		if (!selected.has(unit.id)) continue;
		const existing = registry.getUnit(unit.id);
		if (existing && !options.overrideExisting) {
			if (existing.dimension !== unit.dimension)
				throw new Error(`Unit '${unit.id}' conflicts with the common catalog`);
			continue;
		}
		const canonicalUnit = options.canonicalUnits?.[unit.dimension];
		registry.registerUnit({
			...unit,
			canonicalUnit: canonicalUnit ?? unit.canonicalUnit,
		});
	}
}

export function createCommonConversionRegistry(
	options: CommonUnitCatalogOptions = {},
): QuantityConversionRegistry {
	const registry = new QuantityConversionRegistry();
	registerCommonUnits(registry, options);
	return registry;
}

const COMMON_EXPRESSIONS: CommonUnitExpressions = {
	"m/s": {
		factors: [
			{ unitId: "m", exponent: 1 },
			{ unitId: "s", exponent: -1 },
		],
	},
	"km/h": {
		factors: [
			{ unitId: "km", exponent: 1 },
			{ unitId: "h", exponent: -1 },
		],
	},
	"[mi_i]/h": {
		factors: [
			{ unitId: "[mi_i]", exponent: 1 },
			{ unitId: "h", exponent: -1 },
		],
	},
	"[ft_i]/s": {
		factors: [
			{ unitId: "[ft_i]", exponent: 1 },
			{ unitId: "s", exponent: -1 },
		],
	},
	"m/s2": {
		factors: [
			{ unitId: "m", exponent: 1 },
			{ unitId: "s", exponent: -2 },
		],
	},
	"km/h2": {
		factors: [
			{ unitId: "km", exponent: 1 },
			{ unitId: "h", exponent: -2 },
		],
	},
	"[ft_i]/s2": {
		factors: [
			{ unitId: "[ft_i]", exponent: 1 },
			{ unitId: "s", exponent: -2 },
		],
	},
	m2: { factors: [{ unitId: "m", exponent: 2 }] },
	cm2: { factors: [{ unitId: "cm", exponent: 2 }] },
	"L/min": {
		factors: [
			{ unitId: "L", exponent: 1 },
			{ unitId: "min", exponent: -1 },
		],
	},
	"mL/s": {
		factors: [
			{ unitId: "mL", exponent: 1 },
			{ unitId: "s", exponent: -1 },
		],
	},
	"[gal_us]/min": {
		factors: [
			{ unitId: "[gal_us]", exponent: 1 },
			{ unitId: "min", exponent: -1 },
		],
	},
	"kg/s": {
		factors: [
			{ unitId: "kg", exponent: 1 },
			{ unitId: "s", exponent: -1 },
		],
	},
	"g/min": {
		factors: [
			{ unitId: "g", exponent: 1 },
			{ unitId: "min", exponent: -1 },
		],
	},
	"[lb_av]/h": {
		factors: [
			{ unitId: "[lb_av]", exponent: 1 },
			{ unitId: "h", exponent: -1 },
		],
	},
};

export function getCommonUnitExpression(
	symbol: keyof CommonUnitExpressions,
): UnitExpression {
	const expression = COMMON_EXPRESSIONS[symbol];
	if (!expression)
		throw new Error(`Unknown common unit expression '${symbol}'`);
	return {
		factors: expression.factors.map((factor) => ({ ...factor })),
	};
}
