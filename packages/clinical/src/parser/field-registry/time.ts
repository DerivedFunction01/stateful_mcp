import type { ClinicalDateRange } from "../../schemas/time";
import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { getCompiledRegex } from "../_compiled-regex";
import { FieldResolverEngine } from "../field-resolver-engine";

function resolveTimeUnit(
	rawUnit: string,
	attributeRules: AttributeParserRule[],
): string {
	const timeUnitRules = attributeRules.filter(
		(rule) => rule.targetField === "time_unit",
	);
	for (const rule of timeUnitRules) {
		for (const pattern of rule.regexPatterns) {
			const flags = rule.isCaseInsensitive !== false ? "i" : "";
			const regex = getCompiledRegex(pattern, flags);
			if (regex.test(rawUnit)) {
				return rule.targetValue;
			}
		}
	}
	return rawUnit;
}

export function createDateRangeFieldRegistry(
	attributeRules: AttributeParserRule[],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "frequency_details",
			targetField: "time.repeat",
			compute: (_slots, _conceptDefaults, rawGroups) => {
				const rawMult = rawGroups?.multiplier;
				const rawUnit = rawGroups?.unit;
				if (!rawUnit) return undefined;
				const resolvedUnit = resolveTimeUnit(rawUnit, attributeRules) as
					| "second"
					| "minute"
					| "hour"
					| "day"
					| "week"
					| "month"
					| "year"
					| undefined;
				if (!resolvedUnit) return undefined;
				const multiplier = rawMult ? Number.parseFloat(rawMult) : 1;
				return { multiplier, level: resolvedUnit };
			},
		},
	];
}

export const dateRangeRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	profile: any,
	attributeRules?: AttributeParserRule[],
) =>
	FieldResolverEngine.transform(
		createDateRangeFieldRegistry(attributeRules || []),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

export const dateRangeConfig: SchemaParserConfig = {
	schema: "ClinicalDateRange",
	targetSchema: "ClinicalDateRange",
	preparsedContextKeys: ["timeSpan", "frequency", "attributes"],
};
