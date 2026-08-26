import { QuantityConversionRegistry } from "../../conversion-registry";
import type { StandardUnit } from "./factory";
import { imperialUnits } from "./imperial";
import { siUnits } from "./si";
import type { CommonUnitCatalogOptions } from "./types";
import { usCustomaryUnits } from "./us-customary";

export type { CommonUnitCatalogOptions, StandardUnitBundle } from "./types";
export { STANDARD_UNIT_BUNDLES } from "./types";

function units(options: CommonUnitCatalogOptions): StandardUnit[] {
	return [...siUnits(options), ...usCustomaryUnits(), ...imperialUnits()];
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
