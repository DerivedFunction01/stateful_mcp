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
		},
		{
			sourceKey: "severityScore",
			targetField: "severityScore",
			compute: (slots, conceptDefaults, rawGroups) => {
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
