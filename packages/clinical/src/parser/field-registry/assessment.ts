import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

export function createAssessmentFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [];
}

export const assessmentRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const extractedData = FieldResolverEngine.transform(
		createAssessmentFieldRegistry(attributeRules),
		token,
		conceptDefaults,
		targetSchema,
		profile,
	);

	if (unmatched && unmatched.length > 0) {
		if (!conceptFields?.primaryDiagnosis) {
			if (!extractedData.primaryDiagnosis) {
				extractedData.primaryDiagnosis = unmatched[0];
			}
		}
		if (unmatched.length > 1) {
			extractedData.supportingConcepts = unmatched.slice(1);
		}
	}

	return extractedData;
};

export const assessmentConfig: SchemaParserConfig = {
	schema: "AssessmentObject",
	targetSchema: "AssessmentObject",
	preparsedContextKeys: [],
};
