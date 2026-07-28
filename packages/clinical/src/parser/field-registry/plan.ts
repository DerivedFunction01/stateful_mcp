import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

function createBaseOrderRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "procedure",
			targetField: "procedure",
			conceptDefaultPath: ["procedure"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.procedure;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "priority",
			targetField: "priority",
			schemaDefaultField: "priority",
			conceptDefaultPath: ["priority"],
		},
		{
			sourceKey: "reason",
			targetField: "reason",
			conceptDefaultPath: ["reason"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.reason;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
	];
}

function createInvestigationOrderRegistry(
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		...createBaseOrderRegistry(attributeRules),
		{
			sourceKey: "investigation_type",
			targetField: "investigationType",
			schemaDefaultField: "investigationType",
			conceptDefaultPath: ["investigationType"],
		},
		{
			sourceKey: "specimen_type",
			targetField: "specimenType",
			conceptDefaultPath: ["specimenType"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.specimen_type;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "panel_code",
			targetField: "panelCode",
			conceptDefaultPath: ["panelCode"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.panel_code;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "laterality",
			targetField: "laterality",
			schemaDefaultField: "laterality",
			conceptDefaultPath: ["laterality"],
		},
	];
}

function createReferralOrderRegistry(
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		...createBaseOrderRegistry(attributeRules),
		{
			sourceKey: "specialist_discipline",
			targetField: "specialistDiscipline",
			conceptDefaultPath: ["specialistDiscipline"],
		},
		{
			sourceKey: "referral_urgency",
			targetField: "referralUrgency",
			schemaDefaultField: "referralUrgency",
			conceptDefaultPath: ["referralUrgency"],
		},
		{
			sourceKey: "clinical_question",
			targetField: "clinicalQuestion",
		},
		{
			sourceKey: "routing_notes",
			targetField: "routingNotes",
		},
	];
}

function createInterventionOrderRegistry(
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		...createBaseOrderRegistry(attributeRules),
		{
			sourceKey: "procedure_location",
			targetField: "procedureLocation",
			conceptDefaultPath: ["procedureLocation"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.procedure_location;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "anesthesia_type",
			targetField: "anesthesiaType",
			schemaDefaultField: "anesthesiaType",
			conceptDefaultPath: ["anesthesiaType"],
		},
	];
}

function createSafetyNettingPlanRegistry(
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "red_flag_symptoms",
			targetField: "redFlagSymptoms",
			conceptDefaultPath: ["redFlagSymptoms"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.red_flag_symptoms;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
		{
			sourceKey: "returnPrecautions",
			targetField: "returnPrecautions",
		},
		{
			sourceKey: "follow_up_triggers",
			targetField: "followUpTriggers",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.follow_up_triggers;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw;
				return [raw];
			},
		},
		{
			sourceKey: "escalation_path",
			targetField: "escalationPath",
			schemaDefaultField: "escalationPath",
			conceptDefaultPath: ["escalationPath"],
		},
	];
}

export function createPlanFieldRegistry(
	schema: string,
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	switch (schema) {
		case "InvestigationOrderObject":
			return createInvestigationOrderRegistry(attributeRules);
		case "ReferralOrderObject":
			return createReferralOrderRegistry(attributeRules);
		case "InterventionOrderObject":
			return createInterventionOrderRegistry(attributeRules);
		case "SafetyNettingPlan":
			return createSafetyNettingPlanRegistry(attributeRules);
		default:
			return [];
	}
}

export function planRouter(
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	_profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) {
	const registry = createPlanFieldRegistry(targetSchema, attributeRules || []);
	const extractedData = FieldResolverEngine.transform(
		registry,
		token,
		conceptDefaults,
		targetSchema,
		_profile,
	);

	if (unmatched && unmatched.length > 0) {
		switch (targetSchema) {
			case "InvestigationOrderObject":
			case "ReferralOrderObject":
			case "InterventionOrderObject":
				if (!conceptFields?.procedure && !extractedData.procedure) {
					extractedData.procedure = unmatched[0];
				}
				break;
			case "SafetyNettingPlan":
				if (!conceptFields?.redFlagSymptoms && !extractedData.redFlagSymptoms) {
					extractedData.redFlagSymptoms = unmatched;
				}
				break;
		}
	}

	return extractedData;
}

export const investigationOrderConfig: SchemaParserConfig = {
	schema: "InvestigationOrderObject",
	targetSchema: "InvestigationOrderObject",
	preparsedContextKeys: [],
};

export const referralOrderConfig: SchemaParserConfig = {
	schema: "ReferralOrderObject",
	targetSchema: "ReferralOrderObject",
	preparsedContextKeys: [],
};

export const interventionOrderConfig: SchemaParserConfig = {
	schema: "InterventionOrderObject",
	targetSchema: "InterventionOrderObject",
	preparsedContextKeys: [],
};

export const safetyNettingPlanConfig: SchemaParserConfig = {
	schema: "SafetyNettingPlan",
	targetSchema: "SafetyNettingPlan",
	preparsedContextKeys: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const investigationOrderRegistryTests: FieldRegistryTestBlock = {
	schema: "InvestigationOrderObject",
	router: planRouter,
	cases: [
		{
			description: "procedure: first unmatched becomes procedure",
			input: {
				unmatched: [
					{ conceptId: "LOINC::24320-4", display: "Basic Metabolic Panel" },
				],
			},
			matchKeys: ["procedure"],
			expected: {
				procedure: {
					conceptId: "LOINC::24320-4",
					display: "Basic Metabolic Panel",
				},
			},
		},
		{
			description: "priority: from slot directly",
			input: {
				slots: { priority: "urgent" },
			},
			matchKeys: ["priority"],
			expected: { priority: "urgent" },
		},
	],
};

export const referralOrderRegistryTests: FieldRegistryTestBlock = {
	schema: "ReferralOrderObject",
	router: planRouter,
	cases: [
		{
			description: "specialistDiscipline: from slot directly",
			input: {
				slots: {
					specialist_discipline: {
						conceptId: "SNOMED::394838009",
						display: "Cardiology",
					},
				},
			},
			matchKeys: ["specialistDiscipline"],
			expected: {
				specialistDiscipline: {
					conceptId: "SNOMED::394838009",
					display: "Cardiology",
				},
			},
		},
		{
			description: "referral_urgency: from slot directly",
			input: {
				slots: { referral_urgency: "routine" },
			},
			matchKeys: ["referralUrgency"],
			expected: { referralUrgency: "routine" },
		},
	],
};

export const interventionOrderRegistryTests: FieldRegistryTestBlock = {
	schema: "InterventionOrderObject",
	router: planRouter,
	cases: [
		{
			description: "procedure: first unmatched becomes procedure",
			input: {
				unmatched: [
					{ conceptId: "SNOMED::387713000", display: "Surgical procedure" },
				],
			},
			matchKeys: ["procedure"],
			expected: {
				procedure: {
					conceptId: "SNOMED::387713000",
					display: "Surgical procedure",
				},
			},
		},
		{
			description: "anesthesia_type: from slot directly",
			input: {
				slots: { anesthesia_type: "general" },
			},
			matchKeys: ["anesthesiaType"],
			expected: { anesthesiaType: "general" },
		},
	],
};

export const safetyNettingPlanRegistryTests: FieldRegistryTestBlock = {
	schema: "SafetyNettingPlan",
	router: planRouter,
	cases: [
		{
			description: "redFlagSymptoms: all unmatched become redFlagSymptoms",
			input: {
				unmatched: [
					{ conceptId: "SNOMED::271825009", display: "Shortness of breath" },
					{ conceptId: "SNOMED::25064002", display: "Chest pain" },
				],
			},
			matchKeys: ["redFlagSymptoms"],
			expected: {
				redFlagSymptoms: [
					{ conceptId: "SNOMED::271825009", display: "Shortness of breath" },
					{ conceptId: "SNOMED::25064002", display: "Chest pain" },
				],
			},
		},
		{
			description: "returnPrecautions: from slot directly",
			input: {
				slots: { returnPrecautions: "Call if fever persists beyond 48 hours" },
			},
			matchKeys: ["returnPrecautions"],
			expected: { returnPrecautions: "Call if fever persists beyond 48 hours" },
		},
	],
};
