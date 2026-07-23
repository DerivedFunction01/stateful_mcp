import type { DictionaryStore } from "@stateful-mcp/core";
import {
	DEFAULT_ATTRIBUTE_RULES,
	DEFAULT_EVALUATOR_RULES,
} from "../../store/defaults";
import type {
	AttributeParserRule,
	ParserConceptDefault,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
} from "../../store/interfaces";
import { ObservationTokenizer } from "../helpers/observation-helper";
import {
	CANONICAL_TAGS,
	type ParsedItem,
	type ParsedObservationItem,
	type PreparsedContext,
	resolveConceptHelper,
	type SchemaParser,
} from "../schema-parsers";

export class ObservationSchemaParser implements SchemaParser {
	targetSchema = CANONICAL_TAGS.OBSERVATION;

	async parse(
		tag: string,
		content: string,
		dictionaryStore: DictionaryStore,
		conceptDefaultsStore?: ParserConceptDefaultStore,
		attributeRules?: AttributeParserRule[],
		evaluatorRules?: ParserDictionaryRule[],
		termTokenizer?: string,
		allowedNamespaces?: string[],
		preparsedContext?: PreparsedContext,
	): Promise<ParsedItem | null> {
		const attrRules = attributeRules || DEFAULT_ATTRIBUTE_RULES;
		const evalRules = evaluatorRules || DEFAULT_EVALUATOR_RULES;

		let token: any = null;
		if (preparsedContext?.attributes) {
			token = {
				anchorText: content.trim(),
				certainty: preparsedContext.attributes.certainty,
				status: preparsedContext.attributes.status,
				severity: preparsedContext.attributes.severity,
			};
		} else {
			token = ObservationTokenizer.tokenize(content, attrRules, evalRules);
		}
		if (!token || !token.anchorText) return null;

		const certainty = token.certainty || "confirmed";
		const status = token.status || "active";
		const severity = token.severity || "moderate";

		// Resolve concept
		const resolved = await resolveConceptHelper(
			token.anchorText,
			dictionaryStore,
			termTokenizer,
			allowedNamespaces,
		);
		const display = resolved?.display || token.anchorText;
		const conceptId = resolved?.id;

		// Check custom defaults
		let conceptDefaults: ParserConceptDefault | null = null;
		if (conceptId && conceptDefaultsStore) {
			conceptDefaults = await conceptDefaultsStore.get(
				conceptId,
				this.targetSchema,
			);
		}

		const defaultSeverity =
			conceptDefaults?.defaultProperties.severity || severity;
		const defaultCertainty =
			conceptDefaults?.defaultProperties.certainty || certainty;
		const defaultStatus = conceptDefaults?.defaultProperties.status || status;

		const capturedProperties: Record<string, any> = {};
		if (token.severityScore) {
			capturedProperties.severityScore = token.severityScore;
		}

		return {
			tag,
			anchorText: token.anchorText,
			conceptId,
			display,
			severity: defaultSeverity,
			certainty: defaultCertainty,
			status: defaultStatus,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProperties).length > 0
					? capturedProperties
					: undefined,
		} as ParsedObservationItem;
	}
}
