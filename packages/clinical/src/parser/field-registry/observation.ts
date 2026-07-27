import type { ObservationEvent } from "../../schemas/observation";
import type {
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

export const observationFieldRegistry: FieldMappingRule[] = [
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

			// Priority: explicit denominator in text > concept default max score
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
				// Find the next power of 10 greater than or equal to num (minimum scale of 10)
				const inferredMax = 10 ** Math.max(1, Math.ceil(Math.log10(num || 1)));

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

export const observationRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	profile: any,
) =>
	FieldResolverEngine.transform(
		observationFieldRegistry,
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

export const observationConfig: SchemaParserConfig = {
	schema: "ObservationEvent",
	targetSchema: "ObservationEvent",
	preparsedContextKeys: ["measurement", "frequency", "attributes"],
};
