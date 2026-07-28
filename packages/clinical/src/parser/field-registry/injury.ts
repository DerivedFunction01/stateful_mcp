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
			targetField: "injuryType",
			conceptDefaultPath: ["injuryType"],
		},
		{
			sourceKey: "body_region",
			targetField: "bodyRegion",
			conceptDefaultPath: ["bodyRegion"],
		},
		{
			sourceKey: "laterality",
			targetField: "laterality",
			schemaDefaultField: "laterality",
			conceptDefaultPath: ["laterality"],
		},
		{
			sourceKey: "severity",
			targetField: "severity",
			schemaDefaultField: "severity",
			conceptDefaultPath: ["severity"],
		},
		{
			sourceKey: "cause",
			targetField: "cause",
			conceptDefaultPath: ["cause"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.cause;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "date_range",
			targetField: "dateRange",
			schemaDefaultField: "dateRange",
			conceptDefaultPath: ["dateRange"],
		},
	];
}

function createProtectiveEquipmentFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "equipment_type",
			targetField: "equipmentType",
			conceptDefaultPath: ["equipmentType"],
		},
		{
			sourceKey: "body_region",
			targetField: "bodyRegion",
			conceptDefaultPath: ["bodyRegion"],
		},
		{
			sourceKey: "effectiveness",
			targetField: "effectiveness",
			schemaDefaultField: "effectiveness",
			conceptDefaultPath: ["effectiveness"],
		},
		{
			sourceKey: "date_range",
			targetField: "dateRange",
			schemaDefaultField: "dateRange",
			conceptDefaultPath: ["dateRange"],
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
				if (!conceptFields?.injuryType && !extractedData.injuryType) {
					extractedData.injuryType = unmatched[0];
				}
				break;
			case "ProtectiveEquipmentObject":
				if (!conceptFields?.equipmentType && !extractedData.equipmentType) {
					extractedData.equipmentType = unmatched[0];
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
			description: "injuryType: from slot directly",
			input: {
				slots: {
					injury_type: {
						conceptId: "SNOMED::41776006",
						display: "Laceration",
					},
				},
			},
			matchKeys: ["injuryType"],
			expected: {
				injuryType: {
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
			description: "equipmentType: from slot directly",
			input: {
				slots: {
					equipment_type: {
						conceptId: "SNOMED::59037007",
						display: "Helmet",
					},
				},
			},
			matchKeys: ["equipmentType"],
			expected: {
				equipmentType: {
					conceptId: "SNOMED::59037007",
					display: "Helmet",
				},
			},
		},
		{
			description: "effectiveness: from slot directly",
			input: {
				slots: { effectiveness: "effective" },
			},
			matchKeys: ["effectiveness"],
			expected: { effectiveness: "effective" },
		},
	],
};
