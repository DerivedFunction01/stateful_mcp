import type { DictionaryStore } from "@stateful-mcp/core";
import type { MedicationFrequency } from "../../schemas/medication";
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
import { FrequencyHelper } from "../helpers/frequency-helper";
import { TimeHelper } from "../helpers/measurement-helper";
import { MedicationTokenizer } from "../helpers/medication-helper";
import {
	CANONICAL_TAGS,
	type ParsedItem,
	type ParsedMedicationItem,
	type PreparsedContext,
	resolveConceptHelper,
	type SchemaParser,
} from "../schema-parsers";

export class MedicationSchemaParser implements SchemaParser {
	targetSchema = CANONICAL_TAGS.MEDICATION;

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
				route: preparsedContext.attributes.route,
				duration: preparsedContext.timeSpan
					? String(preparsedContext.timeSpan.magnitude) +
						" " +
						(preparsedContext.timeSpan.unit || "")
					: undefined,
			};
		} else {
			token = MedicationTokenizer.tokenize(content, attrRules, evalRules);
		}
		if (!token || !token.anchorText) return null;

		let route = token.route;
		let frequency: MedicationFrequency | undefined =
			preparsedContext?.frequency ||
			FrequencyHelper.parse(content, attrRules, evalRules) ||
			undefined;
		let duration: string | undefined = token.duration;

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

		route = conceptDefaults?.defaultProperties.route || route;
		frequency = conceptDefaults?.defaultProperties.frequency || frequency;
		duration = conceptDefaults?.defaultProperties.duration || duration;

		const possibleDurations = content.match(/(\d+(?:\.\d+)?\s*\S+)/g);
		if (possibleDurations) {
			for (const candidate of possibleDurations) {
				const parsedTime = TimeHelper.parse(candidate, attrRules);
				if (parsedTime && parsedTime.unit) {
					duration = candidate;
					break;
				}
			}
		}

		const capturedProperties: Record<string, any> = {};
		if (token.quantity !== undefined) {
			capturedProperties.quantity = token.quantity;
			if (token.quantityUnit) {
				capturedProperties.unit = token.quantityUnit;
			}
		}

		return {
			tag,
			anchorText: token.anchorText,
			conceptId,
			display,
			route,
			frequency,
			duration,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProperties).length > 0
					? capturedProperties
					: undefined,
		} as ParsedMedicationItem;
	}
}
