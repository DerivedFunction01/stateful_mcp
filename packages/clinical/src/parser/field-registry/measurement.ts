import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

function resolveUnitAnchor(
	rawUnit: string,
	attributeRules: AttributeParserRule[],
): string | undefined {
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

export function createMeasurementFieldRegistry(
	attributeRules: AttributeParserRule[],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "magnitude",
			targetField: "magnitude",
		},
		{
			sourceKey: "unit",
			targetField: "unit",
		},
		{
			sourceKey: "operator",
			targetField: "operator",
		},
		{
			sourceKey: "is_approximate",
			targetField: "is_approximate",
		},
		{
			sourceKey: "num_data_points",
			targetField: "num_data_points",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const str = rawGroups?.num_data_points;
				if (!str) return undefined;
				const num = Number.parseInt(str, 10);
				return Number.isNaN(num) ? undefined : num;
			},
		},
		{
			sourceKey: "unit",
			targetField: "unitAnchor",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const rawUnit = rawGroups?.unit;
				if (!rawUnit) return undefined;
				return resolveUnitAnchor(rawUnit, attributeRules);
			},
		},
		{
			sourceKey: "statistics",
			targetField: "statistics",
		},
	];
}

export const measurementRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	profile: any,
	attributeRules?: AttributeParserRule[],
) =>
	FieldResolverEngine.transform(
		createMeasurementFieldRegistry(attributeRules || []),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

export const measurementConfig: SchemaParserConfig = {
	schema: "SingleMeasurement",
	targetSchema: "SingleMeasurement",
	preparsedContextKeys: ["measurement"],
};
