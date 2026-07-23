import type { OperationalDomain } from "./environment";
import type { DistanceMeasurement } from "./measurement";
import type {
	ClinicalSourceType,
	CodeableConcept,
	ProductIdentifier,
} from "./shared";
import type { ClinicalDateRange } from "./time";

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

export type ImpactArmorCategory =
	| "helmet"
	| "eye_shield"
	| "body_armor"
	| "extremity_guards"
	| "gloves"
	| "boots";

export type LifeSupportEnvCategory =
	| "respirator"
	| "oxygen_system"
	| "thermal_layer"
	| "flotation_device"
	| "propulsion_unit"
	| "blanket_cover";

export type SystemsSuitCategory =
	| "full_body_suit"
	| "harness_parachute"
	| "safety_restraint";

// Consolidated biological operational gear type vector
export type OperationalGearCategory =
	| ImpactArmorCategory
	| LifeSupportEnvCategory
	| SystemsSuitCategory;

export interface ProtectiveItem {
	id: string;
	status: "active" | "inactive" | "damaged" | "destroyed";
	gearCategory: OperationalGearCategory;
	details?: ProductIdentifier;
	operationalDomain?: OperationalDomain;
}

export interface ProtectiveEquipmentObject {
	id: string;
	soapSection: "subjective" | "objective";
	equipmentStatus:
		| "fully_deployed"
		| "partially_deployed"
		| "not_deployed"
		| "deployed_but_malfunctioned"
		| "unknown";
	verifiedDeployedGear: ProtectiveItem[];
	sourceType?: ClinicalSourceType;
	dateRange?: ClinicalDateRange;
}
