import type { OperationalDomain } from "./environment";
import type { DistanceMeasurement } from "./measurement";
import type {
	ClinicalSourceType,
	CodeableConcept,
	ProductIdentifier,
} from "./shared";
import type { ClinicalDateRange } from "./time";

export const IMPACT_ARMOR_CATEGORIES = [
	"helmet",
	"eye_shield",
	"body_armor",
	"extremity_guards",
	"gloves",
	"boots",
] as const;

export type ImpactArmorCategory = (typeof IMPACT_ARMOR_CATEGORIES)[number];

export const LIFE_SUPPORT_ENV_CATEGORIES = [
	"respirator",
	"oxygen_system",
	"thermal_layer",
	"flotation_device",
	"propulsion_unit",
	"blanket_cover",
] as const;

export type LifeSupportEnvCategory =
	(typeof LIFE_SUPPORT_ENV_CATEGORIES)[number];

export const SYSTEMS_SUIT_CATEGORIES = [
	"full_body_suit",
	"harness_parachute",
	"safety_restraint",
] as const;

export type SystemsSuitCategory = (typeof SYSTEMS_SUIT_CATEGORIES)[number];

// Consolidated biological operational gear type vector
export const OPERATIONAL_GEAR_CATEGORIES = [
	...IMPACT_ARMOR_CATEGORIES,
	...LIFE_SUPPORT_ENV_CATEGORIES,
	...SYSTEMS_SUIT_CATEGORIES,
] as const;

export type OperationalGearCategory =
	(typeof OPERATIONAL_GEAR_CATEGORIES)[number];

export interface MechanicalInjuryObject {
	id: string;
	soapSection: "subjective" | "objective";
	energyTransferMechanism:
		| "blunt_impact"
		| "penetrating_projectile"
		| "penetrating_sharp"
		| "blast_overpressure"
		| "crush_compression"
		| "avulsion_shearing"
		| "barotrauma"
		| "thermal_burn";
	anatomyLocations?: CodeableConcept[];
	ballisticProfile?: {
		firearmOrOrdnance?: CodeableConcept;
		caliber?: CodeableConcept;
		projectileType?: string;
		estimatedStandoffDistance?: DistanceMeasurement;
		armorPenetrationStatus?:
			| "defeated_by_armor"
			| "penetrated_armor"
			| "unprotected";
	};
	blastProfile?: {
		blastWaveType:
			| "primary_overpressure"
			| "secondary_shrapnel"
			| "tertiary_impact"
			| "quaternary_burn_chemical";
		detonationStandoffDistance?: DistanceMeasurement;
		enclosedSpace?: boolean;
	};
	fallProfile?: {
		fallHeight: DistanceMeasurement;
		impactSurface?: string;
		freefall?: boolean;
	};
}

// =====================================================================
// REFINED BIOLOGICAL PROTECTIVE GEAR CATEGORIES
// =====================================================================

export const PROTECTIVE_ITEM_STATUSES = [
	"active",
	"inactive",
	"damaged",
	"destroyed",
] as const;

export type ProtectiveItemStatus = (typeof PROTECTIVE_ITEM_STATUSES)[number];

export interface ProtectiveItem {
	id: string;
	status: ProtectiveItemStatus;
	gearCategory: OperationalGearCategory;
	details?: ProductIdentifier;
	operationalDomain?: OperationalDomain;
}

export const EQUIPMENT_STATUSES = [
	"fully_deployed",
	"partially_deployed",
	"not_deployed",
	"deployed_but_malfunctioned",
	"unknown",
] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export interface ProtectiveEquipmentObject {
	id: string;
	soapSection: "subjective" | "objective";
	equipmentStatus: EquipmentStatus;
	verifiedDeployedGear: ProtectiveItem[];
	sourceType?: ClinicalSourceType;
	dateRange?: ClinicalDateRange;
}
