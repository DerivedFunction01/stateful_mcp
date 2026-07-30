import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import {
	buildMeasurement,
	FieldResolverEngine,
} from "../field-resolver-engine";

export function createExposureFieldRegistry(
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "exposure_type",
			targetField: "exposureType",
			schemaDefaultField: "exposureType",
			conceptDefaultPath: ["exposureType"],
		},
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
			sourceKey: "route",
			targetField: "route",
			conceptDefaultPath: ["route"],
		},

		{
			sourceKey: "frequency_details",
			targetField: "frequency.interval",
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
			sourceKey: "allergic",
			targetField: "side_effects.allergic",
			valueMap: { true: true, false: false },
		},
		{
			sourceKey: "intolerant",
			targetField: "side_effects.intolerant",
			valueMap: { true: true, false: false },
		},
		{
			sourceKey: "adverse_reaction",
			targetField: "side_effects.adverse_reaction",
			valueMap: { true: true, false: false },
		},
		// Chemical variant
		{
			sourceKey: "form",
			targetField: "form",
			schemaDefaultField: "form",
			conceptDefaultPath: ["form"],
		},
		// Pharmaceutical variant
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
			sourceKey: "compliance_status",
			targetField: "complianceStatus",
			schemaDefaultField: "complianceStatus",
			conceptDefaultPath: ["complianceStatus"],
		},
		// Biological variant
		{
			sourceKey: "species",
			targetField: "species",
			conceptDefaultPath: ["species"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.species;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "breed",
			targetField: "breedOrCultivar",
			conceptDefaultPath: ["breedOrCultivar"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.breed;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
		{
			sourceKey: "mechanism",
			targetField: "mechanism",
			schemaDefaultField: "mechanism",
			conceptDefaultPath: ["mechanism"],
		},
		{
			sourceKey: "toxic",
			targetField: "isToxicOrVenomous",
			valueMap: { true: true, false: false },
		},
		{
			sourceKey: "pathogen_status",
			targetField: "pathogenVectorStatus",
			schemaDefaultField: "pathogenVectorStatus",
			conceptDefaultPath: ["pathogenVectorStatus"],
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
			sourceKey: "carried_pathogen",
			targetField: "carriedPathogen",
			conceptDefaultPath: ["carriedPathogen"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.carried_pathogen;
				if (!raw) return undefined;
				return Array.isArray(raw) ? raw[0] : raw;
			},
		},
	];
}

export const exposureRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	_profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const registry = createExposureFieldRegistry(attributeRules || []);
	const extractedData = FieldResolverEngine.transform(
		registry,
		token,
		conceptDefaults,
		targetSchema,
		_profile,
	);

	if (unmatched && unmatched.length > 0) {
		if (!conceptFields?.substance && !extractedData.substance) {
			extractedData.substance = unmatched[0];
		}
		if (unmatched.length > 1) {
			extractedData.anatomyLocations = unmatched.slice(1);
		}
	}

	return extractedData;
};

export const exposureConfig: SchemaParserConfig = {
	schema: "ExposureEvent",
	targetSchema: "ExposureEvent",
	preparsedContextKeys: ["frequency", "measurement", "attributes"],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const exposureRegistryTests: FieldRegistryTestBlock = {
	schema: "ExposureEvent",
	router: exposureRouter,
	cases: [
		{
			description: "substance: first unmatched becomes substance",
			input: {
				unmatched: [{ conceptId: "CHEBI::15377", display: "Acetic acid" }],
			},
			matchKeys: ["substance"],
			expected: {
				substance: { conceptId: "CHEBI::15377", display: "Acetic acid" },
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
					quantity: { quantity: "50", unit: "mg" },
				},
			},
			matchKeys: ["dosage"],
			expected: {
				dosage: { magnitude: 50, unit: { display: "mg" } },
			},
		},
		{
			description: "side_effects: from slots",
			input: {
				slots: {
					allergic: "true",
					adverse_reaction: "true",
				},
			},
			matchKeys: ["side_effects"],
			expected: {
				side_effects: { allergic: true, adverse_reaction: true },
			},
		},
	],
};
