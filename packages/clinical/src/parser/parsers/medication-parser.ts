import type { DictionaryStore } from "@stateful-mcp/core";
import type { MedicationFrequency } from "../../schemas/medication";
import { resolveSchemaDefault } from "../../store/default-strategy";
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
import { MedicationTokenizer } from "../helpers/medication-helper";
import { QuantityHelper, QuantityTokenizer } from "../helpers/measurement-helper";
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
			const durationCandidates = preparsedContext.timeSpan || [];
			const durationCandidate = durationCandidates.find((candidate) => {
				if (!candidate.rawUnit || !candidate.magnitude) return false;
				const resolved = QuantityTokenizer.resolveUnit(
					candidate.rawUnit,
					attrRules,
				);
				return resolved !== undefined && QuantityHelper.isTimeResolved(resolved);
			});
			token = {
				anchorText: content.trim(),
				route: preparsedContext.attributes.route,
				duration: durationCandidate
					? String(durationCandidate.magnitude) +
						" " +
						(durationCandidate.rawUnit || "")
					: undefined,
			};
		} else {
			token = MedicationTokenizer.tokenize(content, attrRules, evalRules);
		}
		if (!token || !token.anchorText) return null;

		let route = token.route;
		let frequency = preparsedContext?.frequency;
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

		route =
			conceptDefaults?.defaultProperties.route ||
			resolveSchemaDefault<string>(
				this.targetSchema,
				"route",
				preparsedContext?.profile,
				{ rawText: content, parsedPartial: { route } },
			) ||
			route;
		frequency =
			conceptDefaults?.defaultProperties.frequency ||
			resolveSchemaDefault<MedicationFrequency>(
				this.targetSchema,
				"frequency",
				preparsedContext?.profile,
				{ rawText: content, parsedPartial: { frequency } },
			) ||
			frequency;
		duration =
			conceptDefaults?.defaultProperties.duration ||
			resolveSchemaDefault<string>(
				this.targetSchema,
				"duration",
				preparsedContext?.profile,
				{ rawText: content, parsedPartial: { duration } },
			) ||
			duration;

		if (!duration && preparsedContext?.timeSpan) {
			const durationCandidate = preparsedContext.timeSpan.find((candidate) => {
				if (!candidate.rawUnit || !candidate.magnitude) return false;
				const resolved = QuantityTokenizer.resolveUnit(
					candidate.rawUnit,
					attrRules,
				);
				return resolved !== undefined && QuantityHelper.isTimeResolved(resolved);
			});
			if (durationCandidate) {
				duration =
					String(durationCandidate.magnitude) +
					" " +
					(durationCandidate.rawUnit || "");
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
