import type { AttributeParserRule, FieldMappingRule, SchemaParserConfig } from "../../store/interfaces";
import type { VitalsMeasurementEvent } from "../../schemas/vitals";
import { FieldResolverEngine } from "../field-resolver-engine";

function resolveUnit(rawUnit: string, attributeRules: AttributeParserRule[]): string {
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

export function createVitalsFieldRegistry(attributeRules: AttributeParserRule[]): FieldMappingRule[] {
	return [
		{
			sourceKey: "blood_pressure",
			targetField: "bloodPressureDetails",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const systolicStr = rawGroups?.systolic;
				const diastolicStr = rawGroups?.diastolic;
				if (!systolicStr || !diastolicStr) return undefined;
				const systolic = Number.parseInt(systolicStr, 10);
				const diastolic = Number.parseInt(diastolicStr, 10);
				if (Number.isNaN(systolic) || Number.isNaN(diastolic)) return undefined;
				const unit = rawGroups?.unit?.trim() || "mmHg";
				return {
					systolic: { magnitude: systolic, unit: { display: unit } },
					diastolic: { magnitude: diastolic, unit: { display: unit } },
				};
			},
		},
		{
			sourceKey: "quantity",
			targetField: "measurement",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const quantityStr = rawGroups?.quantity;
				if (!quantityStr) return undefined;
				const magnitude = Number.parseFloat(quantityStr);
				if (Number.isNaN(magnitude)) return undefined;
				const unitStr = rawGroups?.unit;
				const display = unitStr ? resolveUnit(unitStr, attributeRules) : undefined;
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
) =>
	FieldResolverEngine.transform(
		createVitalsFieldRegistry(attributeRules || []),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

export const vitalsConfig: SchemaParserConfig = {
	schema: "VitalsMeasurementEvent",
	targetSchema: "VitalsMeasurementEvent",
	preparsedContextKeys: ["measurement", "attributes"],
};