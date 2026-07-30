import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import {
	buildMeasurement,
	FieldResolverEngine,
} from "../field-resolver-engine";

function resolveUnitAnchor(
	attributeRules: AttributeParserRule[],
	rawUnit: string,
): string | undefined {
	const rules = attributeRules.filter(
		(r: AttributeParserRule) =>
			r.targetField === "unit" && r.unitAnchor !== undefined,
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

function resolveUnit(
	attributeRules: AttributeParserRule[],
	rawUnit: string,
): string {
	let mapped = rawUnit.toLowerCase();
	const rules = attributeRules.filter(
		(r: AttributeParserRule) =>
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

function createBaseVitalsRegistry(
	schema: string,
	attrRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	const rules: FieldMappingRule[] = [
		{
			sourceKey: "category",
			targetField: "category",
			schemaDefaultField: "category",
			conceptDefaultPath: ["category"],
		},
	];

	switch (schema) {
		case "BloodPressureVitalEvent":
		case "VitalsMeasurementEvent":
			rules.push(
				{
					sourceKey: "blood_pressure",
					targetField: "systolic",
					compute: (_slots: any, _conceptDefaults: any, rawGroups: any) => {
						const systolicStr = rawGroups?.systolic;
						if (!systolicStr) return undefined;
						const systolic = Number.parseInt(systolicStr, 10);
						if (Number.isNaN(systolic)) return undefined;
						const unit = rawGroups?.unit?.trim() || "mmHg";
						return {
							magnitude: systolic,
							unit: { display: unit },
						};
					},
				},
				{
					sourceKey: "blood_pressure",
					targetField: "diastolic",
					compute: (_slots: any, _conceptDefaults: any, rawGroups: any) => {
						const diastolicStr = rawGroups?.diastolic;
						if (!diastolicStr) return undefined;
						const diastolic = Number.parseInt(diastolicStr, 10);
						if (Number.isNaN(diastolic)) return undefined;
						const unit = rawGroups?.unit?.trim() || "mmHg";
						return {
							magnitude: diastolic,
							unit: { display: unit },
						};
					},
				},
			);
			break;
	}

	rules.push({
		sourceKey: "quantity",
		targetField: "measurement",
		compute: (_slots: any, _conceptDefaults: any, rawGroups: any) =>
			buildMeasurement(
				rawGroups || {},
				(r: string) => resolveUnit(attrRules, r),
				(r: string) => resolveUnitAnchor(attrRules, r),
			),
	});

	return rules;
}

export function createVitalsFieldRegistry(
	schema: string,
	attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	switch (schema) {
		case "BloodPressureVitalEvent":
			return [...createBaseVitalsRegistry(schema, attributeRules)];
		case "TemperatureVitalEvent":
		case "HeartRateVitalEvent":
		case "RespiratoryRateVitalEvent":
		case "OxygenSaturationVitalEvent":
		case "WeightVitalEvent":
		case "HeightVitalEvent":
			return [...createBaseVitalsRegistry(schema, attributeRules)];
		default:
			return createBaseVitalsRegistry("VitalsMeasurementEvent", attributeRules);
	}
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
		createVitalsFieldRegistry(targetSchema, attributeRules || []),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

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

export const bpVitalConfig: SchemaParserConfig = {
	schema: "BloodPressureVitalEvent",
	targetSchema: "BloodPressureVitalEvent",
	preparsedContextKeys: [],
};
export const tempVitalConfig: SchemaParserConfig = {
	schema: "TemperatureVitalEvent",
	targetSchema: "TemperatureVitalEvent",
	preparsedContextKeys: [],
};
export const hrVitalConfig: SchemaParserConfig = {
	schema: "HeartRateVitalEvent",
	targetSchema: "HeartRateVitalEvent",
	preparsedContextKeys: [],
};
export const rrVitalConfig: SchemaParserConfig = {
	schema: "RespiratoryRateVitalEvent",
	targetSchema: "RespiratoryRateVitalEvent",
	preparsedContextKeys: [],
};
export const o2VitalConfig: SchemaParserConfig = {
	schema: "OxygenSaturationVitalEvent",
	targetSchema: "OxygenSaturationVitalEvent",
	preparsedContextKeys: [],
};
export const weightVitalConfig: SchemaParserConfig = {
	schema: "WeightVitalEvent",
	targetSchema: "WeightVitalEvent",
	preparsedContextKeys: [],
};
export const heightVitalConfig: SchemaParserConfig = {
	schema: "HeightVitalEvent",
	targetSchema: "HeightVitalEvent",
	preparsedContextKeys: [],
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

const vitalsVariantTestCases = [
	{
		variant: "BloodPressureVitalEvent",
		input: {
			namedGroups: {
				blood_pressure: { systolic: "120", diastolic: "80", unit: "mmHg" },
			},
			unmatched: [{ conceptId: "LOINC::55284-4", display: "BP" }],
		},
		matchKeys: ["vitalType", "systolic", "diastolic"],
		expected: {
			vitalType: { conceptId: "LOINC::55284-4", display: "BP" },
			systolic: { magnitude: 120, unit: { display: "mmHg" } },
			diastolic: { magnitude: 80, unit: { display: "mmHg" } },
		},
	},
	{
		variant: "TemperatureVitalEvent",
		input: {
			namedGroups: {
				quantity: { quantity: "37.5", unit: "C" },
			},
			unmatched: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
		},
		matchKeys: ["vitalType", "measurement"],
		expected: {
			vitalType: { conceptId: "LOINC::8310-5", display: "Temperature" },
			measurement: { magnitude: 37.5, unit: { display: "c" } },
		},
	},
	{
		variant: "HeartRateVitalEvent",
		input: {
			namedGroups: {
				quantity: { quantity: "72", unit: "/min" },
			},
			unmatched: [{ conceptId: "LOINC::8867-4", display: "Heart rate" }],
		},
		matchKeys: ["vitalType", "measurement"],
		expected: {
			vitalType: { conceptId: "LOINC::8867-4", display: "Heart rate" },
			measurement: { magnitude: 72, unit: { display: "/min" } },
		},
	},
	{
		variant: "RespiratoryRateVitalEvent",
		input: {
			namedGroups: {
				quantity: { quantity: "16", unit: "breaths_per_min" },
			},
			unmatched: [{ conceptId: "LOINC::9279-1", display: "Respiratory rate" }],
		},
		matchKeys: ["vitalType", "measurement"],
		expected: {
			vitalType: {
				conceptId: "LOINC::9279-1",
				display: "Respiratory rate",
			},
			measurement: { magnitude: 16, unit: { display: "breaths_per_min" } },
		},
	},
	{
		variant: "OxygenSaturationVitalEvent",
		input: {
			namedGroups: {
				quantity: { quantity: "98", unit: "percent" },
			},
			unmatched: [
				{
					conceptId: "LOINC::2708-6",
					display: "Oxygen saturation",
				},
			],
		},
		matchKeys: ["vitalType", "measurement"],
		expected: {
			vitalType: {
				conceptId: "LOINC::2708-6",
				display: "Oxygen saturation",
			},
			measurement: { magnitude: 98, unit: { display: "percent" } },
		},
	},
	{
		variant: "WeightVitalEvent",
		input: {
			namedGroups: {
				quantity: { quantity: "70", unit: "kg" },
			},
			unmatched: [{ conceptId: "LOINC::29463-7", display: "Weight" }],
		},
		matchKeys: ["vitalType", "measurement"],
		expected: {
			vitalType: { conceptId: "LOINC::29463-7", display: "Weight" },
			measurement: { magnitude: 70, unit: { display: "kg" } },
		},
	},
	{
		variant: "HeightVitalEvent",
		input: {
			namedGroups: {
				quantity: { quantity: "175", unit: "cm" },
			},
			unmatched: [{ conceptId: "LOINC::8302-2", display: "Height" }],
		},
		matchKeys: ["vitalType", "measurement"],
		expected: {
			vitalType: { conceptId: "LOINC::8302-2", display: "Height" },
			measurement: { magnitude: 175, unit: { display: "cm" } },
		},
	},
];

export const bloodPressureRegistryTests: FieldRegistryTestBlock = {
	schema: "BloodPressureVitalEvent",
	router: vitalsRouter,
	cases: vitalsVariantTestCases[0].input
		? [
				{
					description:
						"BloodPressureVitalEvent: category fixed + vitalType from unmatched + systolic/diastolic from bp",
					input: vitalsVariantTestCases[0].input,
					matchKeys: vitalsVariantTestCases[0].matchKeys,
					expected: vitalsVariantTestCases[0].expected,
				},
			]
		: [],
};

export const temperatureRegistryTests: FieldRegistryTestBlock = {
	schema: "TemperatureVitalEvent",
	router: vitalsRouter,
	cases: [
		{
			description:
				"TemperatureVitalEvent: category fixed + vitalType from unmatched + measurement from quantity",
			input: vitalsVariantTestCases[1].input,
			matchKeys: vitalsVariantTestCases[1].matchKeys,
			expected: vitalsVariantTestCases[1].expected,
		},
	],
};

export const heartRateRegistryTests: FieldRegistryTestBlock = {
	schema: "HeartRateVitalEvent",
	router: vitalsRouter,
	cases: [
		{
			description:
				"HeartRateVitalEvent: category fixed + vitalType from unmatched + measurement from quantity",
			input: vitalsVariantTestCases[2].input,
			matchKeys: vitalsVariantTestCases[2].matchKeys,
			expected: vitalsVariantTestCases[2].expected,
		},
	],
};

export const respiratoryRateRegistryTests: FieldRegistryTestBlock = {
	schema: "RespiratoryRateVitalEvent",
	router: vitalsRouter,
	cases: [
		{
			description:
				"RespiratoryRateVitalEvent: category fixed + vitalType from unmatched + measurement from quantity",
			input: vitalsVariantTestCases[3].input,
			matchKeys: vitalsVariantTestCases[3].matchKeys,
			expected: vitalsVariantTestCases[3].expected,
		},
	],
};

export const oxygenSaturationRegistryTests: FieldRegistryTestBlock = {
	schema: "OxygenSaturationVitalEvent",
	router: vitalsRouter,
	cases: [
		{
			description:
				"OxygenSaturationVitalEvent: category fixed + vitalType from unmatched + measurement from quantity",
			input: vitalsVariantTestCases[4].input,
			matchKeys: vitalsVariantTestCases[4].matchKeys,
			expected: vitalsVariantTestCases[4].expected,
		},
	],
};

export const weightRegistryTests: FieldRegistryTestBlock = {
	schema: "WeightVitalEvent",
	router: vitalsRouter,
	cases: [
		{
			description:
				"WeightVitalEvent: category fixed + vitalType from unmatched + measurement from quantity",
			input: vitalsVariantTestCases[5].input,
			matchKeys: vitalsVariantTestCases[5].matchKeys,
			expected: vitalsVariantTestCases[5].expected,
		},
	],
};

export const heightRegistryTests: FieldRegistryTestBlock = {
	schema: "HeightVitalEvent",
	router: vitalsRouter,
	cases: [
		{
			description:
				"HeightVitalEvent: category fixed + vitalType from unmatched + measurement from quantity",
			input: vitalsVariantTestCases[6].input,
			matchKeys: vitalsVariantTestCases[6].matchKeys,
			expected: vitalsVariantTestCases[6].expected,
		},
	],
};
