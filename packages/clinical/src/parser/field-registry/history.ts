import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import {
	buildMeasurement,
	FieldResolverEngine,
} from "../field-resolver-engine";

function createAllergyFieldRegistry(
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "substance",
			targetField: "substance",
			conceptDefaultPath: ["substance"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.substance;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "reaction_type",
			targetField: "reactionType",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.reaction_type;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
		{
			sourceKey: "allergy_severity",
			targetField: "allergySeverity",
			schemaDefaultField: "severity",
			conceptDefaultPath: ["severity"],
		},
		{
			sourceKey: "verification_status",
			targetField: "verificationStatus",
			schemaDefaultField: "verificationStatus",
			conceptDefaultPath: ["verificationStatus"],
		},
	];
}

function createSocialHistoryFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "category",
			targetField: "category",
			conceptDefaultPath: ["category"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.category;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "social_status",
			targetField: "status",
			schemaDefaultField: "status",
			conceptDefaultPath: ["status"],
		},
		{
			sourceKey: "quantity",
			targetField: "count",
			compute: (_slots, _conceptDefaults, rawGroups) =>
				buildMeasurement(rawGroups || {}),
		},

		{
			sourceKey: "historical_notes",
			targetField: "historical_notes",
		},
	];
}

function createReportedMedicationFieldRegistry(
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "medication",
			targetField: "medication",
			conceptDefaultPath: ["medication"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.medication;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "quantity",
			targetField: "dosage",
			compute: (_slots, _conceptDefaults, rawGroups) =>
				buildMeasurement(rawGroups || {}),
		},
		{
			sourceKey: "count",
			targetField: "count",
			compute: (_slots, _conceptDefaults, rawGroups) =>
				buildMeasurement(rawGroups || {}),
		},
		{
			sourceKey: "frequency_details",
			targetField: "frequency.details",
		},
		{
			sourceKey: "frequency_prn",
			targetField: "frequency.isPrn",
			valueMap: { true: true },
		},
		{
			sourceKey: "frequency_event_anchor",
			targetField: "frequency.eventAnchor",
		},
		{
			sourceKey: "compliance_status",
			targetField: "complianceStatus",
			schemaDefaultField: "complianceStatus",
			conceptDefaultPath: ["complianceStatus"],
		},
	];
}

function conceptFallback(
	_slots: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	_rawGroups: Record<string, string | undefined> | undefined,
): unknown {
	if (!conceptDefaults) return undefined;
	const concept = conceptDefaults.concept;
	if (concept) return concept;
	return undefined;
}

export function createHistoryFieldRegistry(
	schema: string,
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	switch (schema) {
		case "AllergyEntry":
			return createAllergyFieldRegistry(attributeRules);
		case "SocialHistoryEntry":
			return createSocialHistoryFieldRegistry(attributeRules);
		case "ReportedMedicationEntry":
			return createReportedMedicationFieldRegistry(attributeRules);
		default:
			return [];
	}
}

export function historyRouter(
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	_profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) {
	const registry = createHistoryFieldRegistry(
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
			case "AllergyEntry":
				if (!conceptFields?.substance && !extractedData.substance) {
					extractedData.substance = unmatched[0];
				}
				break;
			case "SocialHistoryEntry":
				if (!conceptFields?.category && !extractedData.category) {
					extractedData.category = unmatched[0];
				}
				break;
			case "ReportedMedicationEntry":
				if (!conceptFields?.medication && !extractedData.medication) {
					extractedData.medication = unmatched[0];
				}
				break;
		}
	}

	return extractedData;
}

export const allergyConfig: SchemaParserConfig = {
	schema: "AllergyEntry",
	targetSchema: "AllergyEntry",
	preparsedContextKeys: [],
};

export const socialHistoryConfig: SchemaParserConfig = {
	schema: "SocialHistoryEntry",
	targetSchema: "SocialHistoryEntry",
	preparsedContextKeys: [],
};

export const reportedMedicationConfig: SchemaParserConfig = {
	schema: "ReportedMedicationEntry",
	targetSchema: "ReportedMedicationEntry",
	preparsedContextKeys: ["frequency", "measurement", "attributes"],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const allergyRegistryTests: FieldRegistryTestBlock = {
	schema: "AllergyEntry",
	router: historyRouter,
	cases: [
		{
			description: "substance: first unmatched becomes substance",
			input: {
				unmatched: [{ conceptId: "SNOMED::719161000", display: "Penicillin" }],
			},
			matchKeys: ["substance"],
			expected: {
				substance: { conceptId: "SNOMED::719161000", display: "Penicillin" },
			},
		},
		{
			description: "verification_status: from slot directly",
			input: {
				slots: { verification_status: "confirmed" },
			},
			matchKeys: ["verificationStatus"],
			expected: { verificationStatus: "confirmed" },
		},
		{
			description: "conceptFields guard: does not overwrite substance",
			input: {
				unmatched: [{ conceptId: "SNOMED::719161000", display: "Penicillin" }],
				conceptFields: {
					substance: { conceptId: "SNOMED::216746003", display: "Latex" },
				},
			},
			matchKeys: ["substance"],
			expected: { substance: undefined },
		},
	],
};

export const socialHistoryRegistryTests: FieldRegistryTestBlock = {
	schema: "SocialHistoryEntry",
	router: historyRouter,
	cases: [
		{
			description: "category: first unmatched becomes category",
			input: {
				unmatched: [{ conceptId: "SNOMED::446701000", display: "Smoking" }],
			},
			matchKeys: ["category"],
			expected: {
				category: { conceptId: "SNOMED::446701000", display: "Smoking" },
			},
		},
		{
			description: "status: from slot directly",
			input: {
				slots: { social_status: "current" },
			},
			matchKeys: ["status"],
			expected: { status: "current" },
		},
		{
			description: "historical_notes: from slot directly",
			input: {
				slots: { historical_notes: "quit 2 years ago" },
			},
			matchKeys: ["historical_notes"],
			expected: { historical_notes: "quit 2 years ago" },
		},
	],
};

export const reportedMedicationRegistryTests: FieldRegistryTestBlock = {
	schema: "ReportedMedicationEntry",
	router: historyRouter,
	cases: [
		{
			description: "medication: first unmatched becomes medication",
			input: {
				unmatched: [{ conceptId: "RxNorm::723", display: "Amoxicillin" }],
			},
			matchKeys: ["medication"],
			expected: {
				medication: { conceptId: "RxNorm::723", display: "Amoxicillin" },
			},
		},
		{
			description: "compliance_status: from slot directly",
			input: {
				slots: { compliance_status: "adherent" },
			},
			matchKeys: ["complianceStatus"],
			expected: { complianceStatus: "adherent" },
		},
		{
			description: "dosage: computes from quantity and unit",
			input: {
				namedGroups: {
					quantity: { quantity: "500", unit: "mg" },
				},
			},
			matchKeys: ["dosage"],
			expected: {
				dosage: { magnitude: 500, unit: { display: "mg" } },
			},
		},
	],
};
