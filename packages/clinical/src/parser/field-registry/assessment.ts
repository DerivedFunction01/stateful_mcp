import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

export function createAssessmentFieldRegistry(
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "diagnosis",
			targetField: "diagnosis",
			conceptDefaultPath: ["diagnosis"],
		},
		{
			sourceKey: "acuity_level",
			targetField: "acuityLevel",
			schemaDefaultField: "acuityLevel",
			conceptDefaultPath: ["acuityLevel"],
		},
		{
			sourceKey: "comorbidities",
			targetField: "comorbidities",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.comorbidities;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
	];
}

export const assessmentRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const extractedData = FieldResolverEngine.transform(
		createAssessmentFieldRegistry(attributeRules),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

	if (unmatched && unmatched.length > 0) {
		if (!conceptFields?.diagnosis) {
			if (!extractedData.diagnosis) {
				extractedData.diagnosis = unmatched[0];
			}
		}
		if (unmatched.length > 1) {
			extractedData.supportingConcepts = unmatched.slice(1);
		}
	}

	return extractedData;
};

export const assessmentConfig: SchemaParserConfig = {
	schema: "PrimaryDiagnosisEntry",
	targetSchema: "PrimaryDiagnosisEntry",
	preparsedContextKeys: [],
};

// ── Optional test block (consumed by field-registry.test.ts) ─────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const assessmentRegistryTests: FieldRegistryTestBlock = {
	schema: "PrimaryDiagnosisEntry",
	router: assessmentRouter,
	cases: [
		{
			description: "unmatched: first concept becomes diagnosis",
			input: {
				namedGroups: {},
				unmatched: [{ conceptId: "SNOMED::233604007", display: "Pneumonia" }],
			},
			matchKeys: ["diagnosis"],
			expected: {
				diagnosis: {
					conceptId: "SNOMED::233604007",
					display: "Pneumonia",
				},
			},
		},
		{
			description: "unmatched: additional concepts become supportingConcepts",
			input: {
				namedGroups: {},
				unmatched: [
					{ conceptId: "SNOMED::233604007", display: "Pneumonia" },
					{ conceptId: "SNOMED::267036007", display: "Dyspnea" },
					{ conceptId: "SNOMED::386661006", display: "Fever" },
				],
			},
			matchKeys: ["diagnosis", "supportingConcepts"],
			expected: {
				diagnosis: {
					conceptId: "SNOMED::233604007",
					display: "Pneumonia",
				},
				supportingConcepts: [
					{ conceptId: "SNOMED::267036007", display: "Dyspnea" },
					{ conceptId: "SNOMED::386661006", display: "Fever" },
				],
			},
		},
		{
			description:
				"conceptFields guard: does not overwrite diagnosis when already set",
			input: {
				namedGroups: {},
				unmatched: [{ conceptId: "SNOMED::233604007", display: "Pneumonia" }],
				conceptFields: {
					diagnosis: {
						conceptId: "SNOMED::195967001",
						display: "Asthma",
					},
				},
			},
			matchKeys: ["diagnosis"],
			expected: {
				diagnosis: undefined,
			},
		},
	],
};
