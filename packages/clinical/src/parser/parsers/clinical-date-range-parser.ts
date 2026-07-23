import type { DictionaryStore } from "@stateful-mcp/core";
import type { ClinicalDateRange } from "../../schemas/time";
import {
	DEFAULT_ATTRIBUTE_RULES,
	DEFAULT_EVALUATOR_RULES,
} from "../../store/defaults";
import type {
	AttributeParserRule,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
} from "../../store/interfaces";
import {
	ClinicalDateRangeHelper,
	ClinicalDateRangeTokenizer,
} from "../helpers/clinical-date-range-helper";
import type {
	ParsedItem,
	PreparsedContext,
	SchemaParser,
} from "../schema-parsers";

interface ParsedClinicalDateRangeResult {
	tag: string;
	anchorText: string;
	dateRange: ClinicalDateRange;
	conceptId?: string;
	display: string;
	targetSchema: string;
	rawText: string;
}

export class ClinicalDateRangeSchemaParser implements SchemaParser {
	targetSchema = "ClinicalDateRange";

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

		const result: ParsedClinicalDateRangeResult = {
			tag,
			anchorText: cleaned,
			dateRange,
			display: cleaned,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${cleaned}`,
		};

		return result as ParsedItem;
	}
}
