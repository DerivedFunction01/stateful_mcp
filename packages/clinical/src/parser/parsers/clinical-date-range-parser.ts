import type { DictionaryStore } from "@stateful-mcp/core";
import type { CodeableConcept } from "../../schemas/shared";
import type {
	AttributeParserRule,
	ConceptFieldStore,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
} from "../../store/interfaces";
import type { ParsedCellHistoryStore } from "../../store/learning/interfaces";
import {
	ClinicalDateRangeHelper,
	ClinicalDateRangeTokenizer,
} from "../helpers/clinical-date-range-helper";
import type {
	ParsedCandidateEnvelope,
	ParsedClinicalDateRangeItem,
	ParsedItemUnion,
	PreparsedContext,
	SchemaParser,
} from "../schema-parsers";

export class ClinicalDateRangeSchemaParser implements SchemaParser {
	targetSchema = "ClinicalDateRange";

	async preview(
		tag: string,
		content: string,
		dictionaryStore: DictionaryStore,
		conceptDefaultsStore?: ParserConceptDefaultStore,
		attributeRules?: AttributeParserRule[],
		evaluatorRules?: ParserDictionaryRule[],
		termTokenizer?: string,
		allowedNamespaces?: string[],
		preparsedContext?: PreparsedContext,
		historyStore?: ParsedCellHistoryStore,
		conceptFieldStore?: ConceptFieldStore,
		concepts?: CodeableConcept[],
	): Promise<ParsedCandidateEnvelope> {
		const parsed = await this.parse(
			tag,
			content,
			dictionaryStore,
			conceptDefaultsStore,
			attributeRules,
			evaluatorRules,
			termTokenizer,
			allowedNamespaces,
			preparsedContext,
		);
		return makePreviewEnvelope(parsed);
	}

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
		conceptFieldStore?: ConceptFieldStore,
		concepts?: CodeableConcept[],
	): Promise<ParsedItemUnion | null> {
		const attrRules = attributeRules || [];
		const evalRules = evaluatorRules || [];
		const cleaned = content.trim();
		if (!cleaned) return null;

		const token = ClinicalDateRangeTokenizer.tokenize(
			cleaned,
			attrRules,
			evalRules,
		);
		if (!token) return null;

		const dateRange = ClinicalDateRangeHelper.build(token);
		if (!dateRange) return null;

		const attributes: Record<string, any> = {};
		const extractedData = (dateRange || {}) as Record<string, any>;

		return {
			targetSchema: this.targetSchema,
			attributes,
			concept: [],
			rawText: `${tag} ${cleaned}`,
			tag,
			extractedData,
		} as ParsedClinicalDateRangeItem;
	}
}

function makePreviewEnvelope(
	parsed: ParsedItemUnion | null,
): ParsedCandidateEnvelope {
	return {
		deterministic: parsed ? [parsed] : [],
		learned: parsed ? [parsed] : [],
	};
}
