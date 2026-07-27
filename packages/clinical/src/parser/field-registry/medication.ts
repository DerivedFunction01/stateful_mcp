import type { MedicationOrderObject } from "../../schemas/medication";
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

export function createMedicationFieldRegistry(
	attributeRules: AttributeParserRule[],
): FieldMappingRule[] {
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
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const qtyStr = rawGroups?.quantity;
				if (!qtyStr) return undefined;
				const quantity = Number.parseFloat(qtyStr);
				if (Number.isNaN(quantity)) return undefined;
				const unitStr = rawGroups?.unit;
				const quantityUnit = unitStr
					? resolveUnit(unitStr, attributeRules)
					: undefined;
				return {
					magnitude: quantity,
					unit: quantityUnit ? { display: quantityUnit } : undefined,
				};
			},
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
		{
			sourceKey: "frequency_details",
			targetField: "frequency.details",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const rawMult = rawGroups?.multiplier;
				const rawUnit = rawGroups?.unit;
				if (!rawUnit) return undefined;
				const resolvedUnit = resolveUnit(rawUnit, attributeRules) as
					| "second"
					| "minute"
					| "hour"
					| "day"
					| "week"
					| "month"
					| "year"
					| undefined;
				if (!resolvedUnit) return undefined;
				const times = rawMult ? Number.parseFloat(rawMult) : 1;
				return { times, period: resolvedUnit };
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
) =>
	FieldResolverEngine.transform(
		createMedicationFieldRegistry(attributeRules || []),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

export const medicationConfig: SchemaParserConfig = {
	schema: "MedicationOrderObject",
	targetSchema: "MedicationOrderObject",
	preparsedContextKeys: ["frequency", "measurement", "attributes"],
};
