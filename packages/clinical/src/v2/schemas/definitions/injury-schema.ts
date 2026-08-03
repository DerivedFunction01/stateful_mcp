import {
	EQUIPMENT_STATUSES,
	OPERATIONAL_GEAR_CATEGORIES,
	PROTECTIVE_ITEM_STATUSES,
} from "../../../schemas/injury";
import { CLINICAL_SOURCE_TYPES } from "../../../schemas/shared";
import { defineSchema } from "../schema-factory";

export const mechanicalInjurySchema = defineSchema({
	schema: "MechanicalInjury",
	version: 1,
	status: "published",
	fields: {
		id: {
			path: "id",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: true,
		},
		soapSection: {
			path: "soapSection",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: ["subjective", "objective"],
		},
		energyTransferMechanism: {
			path: "energyTransferMechanism",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: [
				"blunt_impact",
				"penetrating_projectile",
				"penetrating_sharp",
				"blast_overpressure",
				"crush_compression",
				"avulsion_shearing",
				"barotrauma",
				"thermal_burn",
			],
		},
		anatomyLocations: {
			path: "anatomyLocations",
			valueKind: "concept_array",
			cardinality: "many",
			required: false,
			conceptResolution: { required: true },
		},
		ballisticProfile: {
			path: "ballisticProfile",
			valueKind: "composite",
			cardinality: "one",
			required: false,
		},
	},
});

export const protectiveEquipmentSchema = defineSchema({
	schema: "ProtectiveEquipment",
	version: 1,
	status: "published",
	fields: {
		id: {
			path: "id",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: true,
		},
		soapSection: {
			path: "soapSection",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: ["subjective", "objective"],
		},
		equipmentStatus: {
			path: "equipmentStatus",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: EQUIPMENT_STATUSES,
		},
		verifiedDeployedGear: {
			path: "verifiedDeployedGear",
			valueKind: "composite",
			cardinality: "many",
			required: true,
		},
		"verifiedDeployedGear[].status": {
			path: "verifiedDeployedGear[].status",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: PROTECTIVE_ITEM_STATUSES,
		},
		"verifiedDeployedGear[].gearCategory": {
			path: "verifiedDeployedGear[].gearCategory",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: OPERATIONAL_GEAR_CATEGORIES,
		},
		sourceType: {
			path: "sourceType",
			valueKind: "enum",
			cardinality: "one",
			required: false,
			enumValues: CLINICAL_SOURCE_TYPES,
		},
		dateRange: {
			path: "dateRange",
			valueKind: "temporal",
			temporalType: "date_range",
			cardinality: "one",
			required: false,
		},
	},
});
