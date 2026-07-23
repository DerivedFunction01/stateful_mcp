import type { DictionaryStore } from "@stateful-mcp/core";
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
import type {
	ParsedCellHistoryKey,
	ParsedCellHistoryStore,
	ParsedCellObservationDetailV1,
} from "../../store/parsed-cell-store";
import { ObservationPreferenceRanker } from "../../store/parsed-cell-store";
import { ObservationTokenizer } from "../helpers/observation-helper";
import {
	CANONICAL_TAGS,
	type ParsedCandidateEnvelope,
	type ParsedItem,
	type ParsedObservationItem,
	type PreparsedContext,
	resolveConceptHelper,
	type SchemaParser,
} from "../schema-parsers";

export class ObservationSchemaParser implements SchemaParser {
	targetSchema = CANONICAL_TAGS.OBSERVATION;

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
	): Promise<ParsedCandidateEnvelope<ParsedObservationItem>> {
		const deterministic = await this.parse(
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
		const historyCandidates = historyStore
			? await this.getHistoryCandidates(
					tag,
					content,
					preparsedContext,
					historyStore,
				)
			: [];
		const ranker = new ObservationPreferenceRanker();
		const learned = historyCandidates
			.map((candidate) => ({
				candidate: candidate.parsedItem,
				score: ranker.score(
					candidate,
					buildRankerContext(tag, content, this.targetSchema, candidate),
				),
			}))
			.sort((a, b) => b.score.score - a.score.score)
			.map((entry) => entry.candidate);

		return {
			deterministic: deterministic
				? [deterministic as ParsedObservationItem]
				: [],
			learned:
				learned.length > 0
					? learned
					: deterministic
						? [deterministic as ParsedObservationItem]
						: [],
		};
	}

	private async getHistoryCandidates(
		tag: string,
		content: string,
		preparsedContext: PreparsedContext | undefined,
		historyStore: ParsedCellHistoryStore,
	): Promise<ParsedCellObservationDetailV1[]> {
		const key: ParsedCellHistoryKey = {
			personnelId: preparsedContext?.rankingSignals?.personnelId,
			specialtyId: preparsedContext?.rankingSignals?.specialtyId,
			facilityId: preparsedContext?.rankingSignals?.facilityId,
			tag,
			targetSchema: this.targetSchema,
			rawText: content,
		};
		const historyRows = await historyStore.getObservationHistory(key);
		return historyRows;
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

		const certainty = token.certainty;
		const status = token.status;
		const severity = token.severity;
		const resolvedCertainty =
			resolveSchemaDefault<string>(
				this.targetSchema,
				"certainty",
				preparsedContext?.profile,
				{ rawText: content, parsedPartial: { certainty, status, severity } },
			) || certainty;
		const resolvedStatus =
			resolveSchemaDefault<string>(
				this.targetSchema,
				"status",
				preparsedContext?.profile,
				{ rawText: content, parsedPartial: { certainty, status, severity } },
			) || status;
		const resolvedSeverity =
			resolveSchemaDefault<string>(
				this.targetSchema,
				"severity",
				preparsedContext?.profile,
				{ rawText: content, parsedPartial: { certainty, status, severity } },
			) || severity;

		const resolved = await resolveConceptHelper(
			token.anchorText,
			dictionaryStore,
			termTokenizer,
			allowedNamespaces,
		);
		const display = resolved?.display || token.anchorText;
		const conceptId = resolved?.id;

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
			severity: defaultSeverity || resolvedSeverity,
			certainty: defaultCertainty || resolvedCertainty,
			status: defaultStatus || resolvedStatus,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProperties).length > 0
					? capturedProperties
					: undefined,
		} as ParsedObservationItem;
	}
}

function buildRankerContext(
	tag: string,
	rawText: string,
	targetSchema: string,
	candidate: ParsedCellObservationDetailV1,
) {
	const parsedItem = candidate.parsedItem;
	return {
		tag,
		targetSchema,
		rawText,
		anchorText: parsedItem.anchorText || parsedItem.display || "",
		candidateTokens: [],
		sharedShape: {
			schema: targetSchema,
			slots: {
				conceptId: parsedItem.conceptId,
				severity: parsedItem.severity,
				certainty: parsedItem.certainty,
				status: parsedItem.status,
			},
		},
	};
}
