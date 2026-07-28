import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

function resolveUnit(
	rawUnit: string,
	attributeRules: AttributeParserRule[],
): string {
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

export function createVitalsFieldRegistry(
	attributeRules: AttributeParserRule[],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "blood_pressure",
			targetField: "systolic",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const systolicStr = rawGroups?.systolic;
				if (!systolicStr) return undefined;
				const systolic = Number.parseInt(systolicStr, 10);
				if (Number.isNaN(systolic)) return undefined;
				const unit = rawGroups?.unit?.trim() || "mmHg";
				return { magnitude: systolic, unit: { display: unit } };
			},
		},
		{
			sourceKey: "blood_pressure",
			targetField: "diastolic",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const diastolicStr = rawGroups?.diastolic;
				if (!diastolicStr) return undefined;
				const diastolic = Number.parseInt(diastolicStr, 10);
				if (Number.isNaN(diastolic)) return undefined;
				const unit = rawGroups?.unit?.trim() || "mmHg";
				return { magnitude: diastolic, unit: { display: unit } };
			},
		},
		{
			sourceKey: "quantity",
			targetField: "measurement",
			compute: (slots, _conceptDefaults, rawGroups) => {
				const quantityStr = rawGroups?.quantity;
				if (!quantityStr) return undefined;
				const magnitude = Number.parseFloat(quantityStr);
				if (Number.isNaN(magnitude)) return undefined;
				const unitStr = rawGroups?.unit;
				const display = unitStr
					? resolveUnit(unitStr, attributeRules)
					: undefined;
				return {
					magnitude,
					unit: display ? { display } : undefined,
				};
			},
		},
		{
			sourceKey: "unit",
			targetField: "measurement.unit",
		},
	];
}

export const vitalsRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const extractedData = FieldResolverEngine.transform(
		createVitalsFieldRegistry(attributeRules || []),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

	// Schema-specific fallback for unmatched concepts
	if (unmatched && unmatched.length > 0) {
		if (!conceptFields?.vitalType) {
			if (!extractedData.vitalType) {
				extractedData.vitalType = unmatched[0];
			}
		}
		if (unmatched.length > 1) {
			extractedData.anatomyLocations = unmatched.slice(1);
		}
	}

	return extractedData;
};

export const vitalsConfig: SchemaParserConfig = {
	schema: "VitalsMeasurementEvent",
	targetSchema: "VitalsMeasurementEvent",
	preparsedContextKeys: ["measurement", "attributes"],
};

// ── Optional test block (consumed by field-registry.test.ts) ─────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const vitalsRegistryTests: FieldRegistryTestBlock = {
	schema: "VitalsMeasurementEvent",
	router: vitalsRouter,
	cases: [
		{
			description: "blood_pressure: produces top-level systolic and diastolic",
			input: {
				namedGroups: {
					blood_pressure: { systolic: "120", diastolic: "80", unit: "mmHg" },
				},
			},
			expected: {
				systolic: { magnitude: 120, unit: { display: "mmHg" } },
				diastolic: { magnitude: 80, unit: { display: "mmHg" } },
			},
		},
		{
			description: "blood_pressure: defaults unit to mmHg when not captured",
			input: {
				namedGroups: {
					blood_pressure: { systolic: "118", diastolic: "76" },
				},
			},
			expected: {
				systolic: { magnitude: 118, unit: { display: "mmHg" } },
				diastolic: { magnitude: 76, unit: { display: "mmHg" } },
			},
		},
		{
			description: "blood_pressure: missing diastolic produces only systolic",
			input: {
				namedGroups: {
					blood_pressure: { systolic: "120" },
				},
			},
			matchKeys: ["systolic", "diastolic"],
			expected: {
				systolic: { magnitude: 120, unit: { display: "mmHg" } },
				diastolic: undefined,
			},
		},
		{
			description:
				"quantity: produces measurement object with magnitude and unit",
			input: {
				namedGroups: {
					quantity: { quantity: "37.5", unit: "C" },
				},
			},
			matchKeys: ["measurement"],
			expected: {
				measurement: { magnitude: 37.5, unit: { display: "c" } },
			},
		},
		{
			description:
				"quantity: produces measurement without unit when unit absent",
			input: {
				namedGroups: {
					quantity: { quantity: "98" },
				},
			},
			matchKeys: ["measurement"],
			expected: {
				measurement: { magnitude: 98, unit: undefined },
			},
		},
		{
			description: "unmatched: first concept becomes vitalType fallback",
			input: {
				namedGroups: {},
				unmatched: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
			},
			matchKeys: ["vitalType"],
			expected: {
				vitalType: { conceptId: "LOINC::8310-5", display: "Temperature" },
			},
		},
		{
			description: "unmatched: additional concepts become anatomyLocations",
			input: {
				namedGroups: {},
				unmatched: [
					{ conceptId: "LOINC::8310-5", display: "Temperature" },
					{ conceptId: "SNOMED::368209003", display: "Right arm" },
				],
			},
			matchKeys: ["vitalType", "anatomyLocations"],
			expected: {
				vitalType: { conceptId: "LOINC::8310-5", display: "Temperature" },
				anatomyLocations: [
					{ conceptId: "SNOMED::368209003", display: "Right arm" },
				],
			},
		},
	],
};
