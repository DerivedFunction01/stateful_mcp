import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

export function createObservationFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "concept",
			targetField: "concept",
			conceptDefaultPath: ["concept"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const raw = rawGroups?.concept;
				if (!raw) return undefined;
				if (Array.isArray(raw)) return raw[0];
				return raw;
			},
		},
		{
			sourceKey: "certainty",
			targetField: "certainty",
			schemaDefaultField: "certainty",
			conceptDefaultPath: ["certainty"],
		},
		{
			sourceKey: "status",
			targetField: "status",
			schemaDefaultField: "status",
			conceptDefaultPath: ["status"],
		},
		{
			sourceKey: "severity",
			targetField: "severity",
			schemaDefaultField: "severity",
			conceptDefaultPath: ["severity"],
			compute: (_slots, conceptDefaults, rawGroups) => {
				const numStr = rawGroups?.numerator;
				if (!numStr) return undefined;
				const num = Number.parseFloat(numStr);

				let den =
					rawGroups?.denominator !== undefined
						? Number.parseFloat(rawGroups.denominator)
						: undefined;

				if (den === undefined && conceptDefaults) {
					const conceptMax = (conceptDefaults as any).defaultProperties
						?.severity_max_score;
					if (conceptMax !== undefined) {
						den = Number(conceptMax);
					}
				}

				if (den === undefined) {
					const inferredMax =
						10 ** Math.max(1, Math.ceil(Math.log10(num || 1)));
					return {
						score: num,
						maxScore: inferredMax,
						normalizedScore: (num / inferredMax) * 10,
					};
				}

				return {
					score: num,
					maxScore: den,
					normalizedScore: (num / den) * 10,
				};
			},
		},
		{
			sourceKey: "trajectory",
			targetField: "trajectory",
			schemaDefaultField: "trajectory",
			conceptDefaultPath: ["trajectory"],
		},
	];
}

export const observationRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const extractedData = FieldResolverEngine.transform(
		createObservationFieldRegistry(attributeRules),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

	// Schema-specific fallback for unmatched concepts
	if (unmatched && unmatched.length > 0) {
		if (!conceptFields?.concept) {
			if (!extractedData.concept) {
				extractedData.concept = unmatched[0];
			}
		}
		if (unmatched.length > 1) {
			extractedData.qualifiers = unmatched.slice(1);
		}
	}

	return extractedData;
};

export const observationConfig: SchemaParserConfig = {
	schema: "ObservationEvent",
	targetSchema: "ObservationEvent",
	preparsedContextKeys: ["measurement", "frequency", "attributes"],
};

// ── Optional test block (consumed by field-registry.test.ts) ─────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const observationRegistryTests: FieldRegistryTestBlock = {
	schema: "ObservationEvent",
	router: observationRouter,
	cases: [
		{
			description: "certainty: reads certainty from slot directly",
			input: {
				slots: { certainty: "confirmed" },
			},
			matchKeys: ["certainty"],
			expected: { certainty: "confirmed" },
		},
		{
			description: "status: reads status from slot directly",
			input: {
				slots: { status: "present" },
			},
			matchKeys: ["status"],
			expected: { status: "present" },
		},
		{
			description:
				"severity: computes score/maxScore/normalizedScore from numerator and denominator",
			input: {
				namedGroups: {
					severity: { numerator: "7", denominator: "10" },
				},
			},
			matchKeys: ["severity"],
			expected: {
				severity: { score: 7, maxScore: 10, normalizedScore: 7 },
			},
		},
		{
			description: "severity: infers maxScore when no denominator given",
			input: {
				namedGroups: {
					severity: { numerator: "7" },
				},
			},
			matchKeys: ["severity"],
			expected: {
				// inferredMax = 10^ceil(log10(7)) = 10
				severity: { score: 7, maxScore: 10, normalizedScore: 7 },
			},
		},
		{
			description: "severity: uses conceptDefault denominator when present",
			input: {
				namedGroups: {
					severity: { numerator: "6" },
				},
				conceptDefaults: {
					defaultProperties: { severity_max_score: "20" },
				},
			},
			matchKeys: ["severity"],
			expected: {
				severity: { score: 6, maxScore: 20, normalizedScore: 3 },
			},
		},
		{
			description: "unmatched: first concept becomes concept field",
			input: {
				namedGroups: {},
				unmatched: [{ conceptId: "SNOMED::386661006", display: "Fever" }],
			},
			matchKeys: ["concept"],
			expected: {
				concept: { conceptId: "SNOMED::386661006", display: "Fever" },
			},
		},
		{
			description: "unmatched: additional concepts become qualifiers",
			input: {
				namedGroups: {},
				unmatched: [
					{ conceptId: "SNOMED::386661006", display: "Fever" },
					{ conceptId: "SNOMED::255604002", display: "Mild" },
				],
			},
			matchKeys: ["concept", "qualifiers"],
			expected: {
				concept: { conceptId: "SNOMED::386661006", display: "Fever" },
				qualifiers: [{ conceptId: "SNOMED::255604002", display: "Mild" }],
			},
		},
	],
};
