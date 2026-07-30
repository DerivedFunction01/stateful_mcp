import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import {
	buildMeasurement,
	FieldResolverEngine,
} from "../field-resolver-engine";

export function createMedicationFieldRegistry(
	attributeRules: AttributeParserRule[],
): FieldMappingRule[] {
	function resolveUnitAnchor(rawUnit: string): string | undefined {
		const rules = attributeRules.filter(
			(r) => r.targetField === "unit" && r.unitAnchor !== undefined,
		);
		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(rawUnit)) {
					return rule.unitAnchor;
				}
			}
		}
		return undefined;
	}

	function resolveUnit(rawUnit: string): string {
		let mapped = rawUnit.toLowerCase();
		const rules = attributeRules.filter(
			(r) =>
				r.targetField === "unit" ||
				r.targetField === "time_unit" ||
				r.targetField === "measurement_unit",
		);
		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(mapped)) {
					mapped = rule.targetValue;
					break;
				}
			}
			if (mapped !== rawUnit.toLowerCase()) break;
		}
		return mapped;
	}

	return [
		{
			sourceKey: "route",
			targetField: "route",
			schemaDefaultField: "route",
			conceptDefaultPath: ["route"],
		},
		{
			sourceKey: "quantity",
			targetField: "dosage",
			compute: (_slots, _conceptDefaults, rawGroups) =>
				buildMeasurement(rawGroups || {}, resolveUnit, resolveUnitAnchor),
		},
		{
			sourceKey: "count",
			targetField: "count",
			compute: (_slots, _conceptDefaults, rawGroups) =>
				buildMeasurement(rawGroups || {}),
		},
		{
			sourceKey: "quantity_to_dispense",
			targetField: "quantityToDispense",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const str = rawGroups?.quantity_to_dispense;
				if (!str) return undefined;
				const num = Number.parseInt(str, 10);
				return Number.isNaN(num) ? undefined : num;
			},
		},
		{
			sourceKey: "authorized_refills",
			targetField: "authorizedRefills",
			schemaDefaultField: "authorizedRefills",
			conceptDefaultPath: ["authorizedRefills"],
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const str = rawGroups?.authorized_refills;
				if (!str) return undefined;
				const num = Number.parseInt(str, 10);
				return Number.isNaN(num) ? undefined : num;
			},
		},
		{
			sourceKey: "generic_substitution",
			targetField: "genericSubstitutionPermitted",
			schemaDefaultField: "genericSubstitutionPermitted",
			conceptDefaultPath: ["genericSubstitutionPermitted"],
			valueMap: { true: true, false: false },
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
			sourceKey: "frequency_shorthand",
			targetField: "frequency.interval",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const shorthand = rawGroups?.frequency_shorthand;
				if (!shorthand) return undefined;
				switch (shorthand) {
					case "BID":
						return { multiplier: 12, unit: "hour" };
					case "TID":
						return { multiplier: 8, unit: "hour" };
					case "QID":
						return { multiplier: 6, unit: "hour" };
					case "QD":
						return { multiplier: 1, unit: "day" };
					default:
						return undefined;
				}
			},
		},
	];
}

export const medicationRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const extractedData = FieldResolverEngine.transform(
		createMedicationFieldRegistry(attributeRules || []),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

	if (unmatched && unmatched.length > 0) {
		if (!conceptFields?.medication) {
			if (!extractedData.medication) {
				extractedData.medication = unmatched[0];
			}
		}
		if (unmatched.length > 1) {
			extractedData.targetIndication = unmatched[1];
		}
	}

	return extractedData;
};

export const medicationConfig: SchemaParserConfig = {
	schema: "MedicationOrderObject",
	targetSchema: "MedicationOrderObject",
	preparsedContextKeys: ["frequency", "measurement", "attributes"],
};

// ── Optional test block (consumed by field-registry.test.ts) ─────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const medicationRegistryTests: FieldRegistryTestBlock = {
	schema: "MedicationOrderObject",
	router: medicationRouter,
	cases: [
		{
			description: "route: reads route from slot directly",
			input: {
				slots: { route: { conceptId: "SNOMED::26643006", display: "Oral" } },
			},
			matchKeys: ["route"],
			expected: {
				route: { conceptId: "SNOMED::26643006", display: "Oral" },
			},
		},
		{
			description: "dosage: computes dosage from quantity and unit",
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
		{
			description: "dosage: produces dosage without unit when absent",
			input: {
				namedGroups: {
					quantity: { quantity: "250" },
				},
			},
			matchKeys: ["dosage"],
			expected: {
				dosage: { magnitude: 250, unit: undefined },
			},
		},
		{
			description: "frequency_shorthand: BID maps to 12-hour interval",
			input: {
				namedGroups: {
					frequency_shorthand: { frequency_shorthand: "BID" },
				},
			},
			matchKeys: ["frequency"],
			expected: {
				frequency: { interval: { multiplier: 12, unit: "hour" } },
			},
		},
		{
			description: "frequency_shorthand: TID maps to 8-hour interval",
			input: {
				namedGroups: {
					frequency_shorthand: { frequency_shorthand: "TID" },
				},
			},
			matchKeys: ["frequency"],
			expected: {
				frequency: { interval: { multiplier: 8, unit: "hour" } },
			},
		},
		{
			description: "unmatched: first concept becomes medication field",
			input: {
				namedGroups: {},
				unmatched: [{ conceptId: "RxNorm::723", display: "Amoxicillin" }],
			},
			matchKeys: ["medication"],
			expected: {
				medication: { conceptId: "RxNorm::723", display: "Amoxicillin" },
			},
		},
		{
			description: "unmatched: second concept becomes targetIndication",
			input: {
				namedGroups: {},
				unmatched: [
					{ conceptId: "RxNorm::723", display: "Amoxicillin" },
					{ conceptId: "SNOMED::40275004", display: "Contact dermatitis" },
				],
			},
			matchKeys: ["medication", "targetIndication"],
			expected: {
				medication: { conceptId: "RxNorm::723", display: "Amoxicillin" },
				targetIndication: {
					conceptId: "SNOMED::40275004",
					display: "Contact dermatitis",
				},
			},
		},
	],
};
