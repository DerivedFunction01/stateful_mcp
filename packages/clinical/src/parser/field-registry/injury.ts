import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

function createMechanicalInjuryFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "injury_type",
			targetField: "energyTransferMechanism",
			conceptDefaultPath: ["energyTransferMechanism"],
		},
		{
			sourceKey: "laterality",
			targetField: "laterality",
			schemaDefaultField: "laterality",
			conceptDefaultPath: ["laterality"],
		},
	];
}

function createProtectiveEquipmentFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "equipment_type",
			targetField: "equipmentStatus",
			schemaDefaultField: "equipmentStatus",
			conceptDefaultPath: ["equipmentStatus"],
		},
	];
}

export function createInjuryFieldRegistry(
	schema: string,
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	switch (schema) {
		case "MechanicalInjuryObject":
			return createMechanicalInjuryFieldRegistry(_attributeRules);
		case "ProtectiveEquipmentObject":
			return createProtectiveEquipmentFieldRegistry(_attributeRules);
		default:
			return [];
	}
}

export const injuryRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	_profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const registry = createInjuryFieldRegistry(
		targetSchema,
		attributeRules || [],
	);
	const extractedData = FieldResolverEngine.transform(
		registry,
		token,
		conceptDefaults,
		targetSchema,
		_profile,
	);

	if (unmatched && unmatched.length > 0) {
		switch (targetSchema) {
			case "MechanicalInjuryObject":
				if (
					!conceptFields?.energyTransferMechanism &&
					!extractedData.energyTransferMechanism
				) {
					extractedData.energyTransferMechanism = unmatched[0];
				}
				break;
			case "ProtectiveEquipmentObject":
				if (!conceptFields?.equipmentStatus && !extractedData.equipmentStatus) {
					extractedData.equipmentStatus = unmatched[0];
				}
				break;
		}
	}

	return extractedData;
};

export const mechanicalInjuryConfig: SchemaParserConfig = {
	schema: "MechanicalInjuryObject",
	targetSchema: "MechanicalInjuryObject",
	preparsedContextKeys: [],
};

export const protectiveEquipmentConfig: SchemaParserConfig = {
	schema: "ProtectiveEquipmentObject",
	targetSchema: "ProtectiveEquipmentObject",
	preparsedContextKeys: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const mechanicalInjuryRegistryTests: FieldRegistryTestBlock = {
	schema: "MechanicalInjuryObject",
	router: injuryRouter,
	cases: [
		{
			description: "energyTransferMechanism: from slot directly",
			input: {
				slots: {
					injury_type: {
						conceptId: "SNOMED::41776006",
						display: "Laceration",
					},
				},
			},
			matchKeys: ["energyTransferMechanism"],
			expected: {
				energyTransferMechanism: {
					conceptId: "SNOMED::41776006",
					display: "Laceration",
				},
			},
		},
		{
			description: "laterality: from slot directly",
			input: {
				slots: { laterality: "left" },
			},
			matchKeys: ["laterality"],
			expected: { laterality: "left" },
		},
	],
};

export const protectiveEquipmentRegistryTests: FieldRegistryTestBlock = {
	schema: "ProtectiveEquipmentObject",
	router: injuryRouter,
	cases: [
		{
			description: "equipmentStatus: from slot directly",
			input: {
				slots: {
					equipment_type: {
						conceptId: "SNOMED::59037007",
						display: "Helmet",
					},
				},
			},
			matchKeys: ["equipmentStatus"],
			expected: {
				equipmentStatus: {
					conceptId: "SNOMED::59037007",
					display: "Helmet",
				},
			},
		},
	],
};
