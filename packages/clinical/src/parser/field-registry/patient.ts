import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

export function createPatientFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "mrn",
			targetField: "mrn",
		},
		{
			sourceKey: "name",
			targetField: "name",
			conceptDefaultPath: ["name"],
		},
		{
			sourceKey: "administrative_gender",
			targetField: "administrativeGender",
			conceptDefaultPath: ["administrativeGender"],
		},
		{
			sourceKey: "status",
			targetField: "status",
			schemaDefaultField: "status",
			conceptDefaultPath: ["status"],
		},
		{
			sourceKey: "date_range",
			targetField: "originationDate",
			schemaDefaultField: "dateRange",
			conceptDefaultPath: ["dateRange"],
		},
		{
			sourceKey: "is_origination_estimated",
			targetField: "isOriginationEstimated",
			valueMap: { true: true, false: false },
		},
		{
			sourceKey: "organism_type",
			targetField: "organismType",
			conceptDefaultPath: ["organismType"],
		},
		{
			sourceKey: "species",
			targetField: "species",
			conceptDefaultPath: ["species"],
		},
		{
			sourceKey: "breed_or_cultivar",
			targetField: "breedOrCultivar",
			conceptDefaultPath: ["breedOrCultivar"],
		},
	];
}

export const patientRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	_profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const registry = createPatientFieldRegistry(attributeRules || []);
	return FieldResolverEngine.transform(
		registry,
		token,
		conceptDefaults,
		targetSchema,
		_profile,
	);
};

export const patientConfig: SchemaParserConfig = {
	schema: "PatientProfile",
	targetSchema: "PatientProfile",
	preparsedContextKeys: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const patientRegistryTests: FieldRegistryTestBlock = {
	schema: "PatientProfile",
	router: patientRouter,
	cases: [
		{
			description: "mrn: from slot directly",
			input: {
				slots: { mrn: "MRN12345" },
			},
			matchKeys: ["mrn"],
			expected: { mrn: "MRN12345" },
		},
		{
			description: "administrativeGender: from slot directly",
			input: {
				slots: { administrative_gender: "male" },
			},
			matchKeys: ["administrativeGender"],
			expected: { administrativeGender: "male" },
		},
		{
			description: "status: from slot directly",
			input: {
				slots: { status: "active" },
			},
			matchKeys: ["status"],
			expected: { status: "active" },
		},
	],
};
