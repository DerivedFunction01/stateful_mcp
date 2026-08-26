import type { QuantityDimension, UnitId } from "../../contracts";

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
