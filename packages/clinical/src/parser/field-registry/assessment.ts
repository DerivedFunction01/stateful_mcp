import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

function createPrimaryDiagnosisEntryFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
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
		{
			sourceKey: "anatomy",
			targetField: "anatomyLocations",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.anatomy;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
		{
			sourceKey: "related_medications",
			targetField: "relatedMedications",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.related_medications;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
	];
}

function createDifferentialDiagnosisEntryFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "diagnosis",
			targetField: "diagnosis",
			conceptDefaultPath: ["diagnosis"],
		},
		{
			sourceKey: "rank",
			targetField: "rank",
			schemaDefaultField: "rank",
		},
		{
			sourceKey: "confidence",
			targetField: "confidence",
			schemaDefaultField: "confidence",
		},
		{
			sourceKey: "supportingConcepts",
			targetField: "supportingConcepts",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
		{
			sourceKey: "refutingConcepts",
			targetField: "refutingConcepts",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
		{
			sourceKey: "related_medications",
			targetField: "relatedMedications",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
		{
			sourceKey: "anatomy",
			targetField: "anatomyLocations",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
	];
}

function createAlgorithmicEvaluationObjectFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "evaluation_type",
			targetField: "evaluationType",
			schemaDefaultField: "evaluationType",
		},
		{
			sourceKey: "algorithm",
			targetField: "algorithm",
			conceptDefaultPath: ["algorithm"],
		},
		{
			sourceKey: "severity_tier",
			targetField: "severityTier",
			schemaDefaultField: "severityTier",
		},
		{
			sourceKey: "hypotheses",
			targetField: "hypothesesAndOutputs",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.hypotheses;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
		{
			sourceKey: "override_status",
			targetField: "overrideStatus",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.override_status;
				if (!raw) return undefined;
				return raw;
			},
		},
	];
}

export function createAssessmentFieldRegistry(
	schema: string,
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	switch (schema) {
		case "DifferentialDiagnosisEntry":
			return createDifferentialDiagnosisEntryFieldRegistry(attributeRules);
		case "AlgorithmicEvaluationObject":
			return createAlgorithmicEvaluationObjectFieldRegistry(attributeRules);
		default:
			return createPrimaryDiagnosisEntryFieldRegistry(attributeRules);
	}
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
		createAssessmentFieldRegistry(targetSchema, attributeRules || []),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

	if (unmatched && unmatched.length > 0) {
		switch (targetSchema) {
			case "PrimaryDiagnosisEntry":
			case "DifferentialDiagnosisEntry":
				if (!conceptFields?.diagnosis) {
					if (!extractedData.diagnosis) {
						extractedData.diagnosis = unmatched[0];
					}
				}
				if (unmatched.length > 1) {
					extractedData.supportingConcepts = unmatched.slice(1);
				}
				break;
			case "AlgorithmicEvaluationObject":
				if (
					!conceptFields?.algorithm &&
					!extractedData.algorithm &&
					unmatched.length > 0
				) {
					extractedData.algorithm = unmatched[0];
				}
				break;
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

export const differentialDiagnosisRegistryTests: FieldRegistryTestBlock = {
	schema: "DifferentialDiagnosisEntry",
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
			description: "rank: from slot directly",
			input: {
				namedGroups: { rank: "1.5" },
			},
			matchKeys: ["rank"],
			expected: { rank: "1.5" },
		},
		{
			description: "confidence: from slot directly",
			input: {
				namedGroups: { confidence: "possible" },
			},
			matchKeys: ["confidence"],
			expected: { confidence: "possible" },
		},
		{
			description: "supportingConcepts and refutingConcepts from rawGroups",
			input: {
				namedGroups: {
					supportingConcepts: [
						{ conceptId: "SNOMED::386661006", display: "Fever" },
					],
					refutingConcepts: [
						{ conceptId: "SNOMED::84229001", display: "Normal CXR" },
					],
				},
			},
			matchKeys: ["supportingConcepts", "refutingConcepts"],
			expected: {
				supportingConcepts: [
					{ conceptId: "SNOMED::386661006", display: "Fever" },
				],
				refutingConcepts: [
					{ conceptId: "SNOMED::84229001", display: "Normal CXR" },
				],
			},
		},
	],
};

export const differentialDiagnosisConfig: SchemaParserConfig = {
	schema: "DifferentialDiagnosisEntry",
	targetSchema: "DifferentialDiagnosisEntry",
	preparsedContextKeys: [],
};

export const algorithmicEvaluationRegistryTests: FieldRegistryTestBlock = {
	schema: "AlgorithmicEvaluationObject",
	router: assessmentRouter,
	cases: [
		{
			description: "evaluationType: from slot directly",
			input: {
				namedGroups: { evaluation_type: "clinical_risk_score" },
			},
			matchKeys: ["evaluationType"],
			expected: { evaluationType: "clinical_risk_score" },
		},
		{
			description: "algorithm: from unmatched fallback",
			input: {
				namedGroups: {},
				unmatched: [
					{
						conceptId: "ALGO::CURB65",
						display: "CURB-65 Score",
					},
				],
			},
			matchKeys: ["algorithm"],
			expected: {
				algorithm: {
					conceptId: "ALGO::CURB65",
					display: "CURB-65 Score",
				},
			},
		},
		{
			description: "severityTier: from slot directly",
			input: {
				namedGroups: { severity_tier: "warning_soft_stop" },
			},
			matchKeys: ["severityTier"],
			expected: { severityTier: "warning_soft_stop" },
		},
	],
};

export const algorithmicEvaluationConfig: SchemaParserConfig = {
	schema: "AlgorithmicEvaluationObject",
	targetSchema: "AlgorithmicEvaluationObject",
	preparsedContextKeys: [],
};
