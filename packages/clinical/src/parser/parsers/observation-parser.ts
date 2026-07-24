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
	ParsedCellWeightedHistoryStore,
} from "../../store/parsed-cell-store";
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
			? await this.getTieredHistoryCandidates(
					tag,
					content,
					preparsedContext,
					historyStore,
				)
			: [];
		const learned = historyCandidates.map(
			(entry) => entry.candidate.parsedItem,
		);

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

	private async getTieredHistoryCandidates(
		tag: string,
		content: string,
		preparsedContext: PreparsedContext | undefined,
		historyStore: ParsedCellHistoryStore,
	): Promise<
		Array<{
			candidate: ParsedCellObservationDetailV1;
			tier: "exact" | "biology" | "specific" | "global" | "adapter";
			weight: number;
		}>
	> {
		const patientContext = preparsedContext?.patientContext;
		const weights = patientContext?.weights || {
			exact: 0.4,
			biology: 0.3,
			specific: 0.2,
			global: 0.1,
		};
		const exactKey: ParsedCellHistoryKey = {
			patientId: preparsedContext?.patientContext?.patientId,
			patientOrganismType: preparsedContext?.patientContext?.organismType,
			patientGender: preparsedContext?.patientContext?.gender,
			patientAgeBucket: preparsedContext?.patientContext?.ageBucket,
			patientSpeciesBucket: preparsedContext?.patientContext?.speciesBucket,
			patientSubBucket: preparsedContext?.patientContext?.subBucket,
			patientBucketKey: preparsedContext?.patientContext?.bucketKey,
			personnelId: preparsedContext?.rankingSignals?.personnelId,
			specialtyId: preparsedContext?.rankingSignals?.specialtyId,
			facilityId: preparsedContext?.rankingSignals?.facilityId,
			tag,
			targetSchema: this.targetSchema,
			rawText: content,
		};
		const biologyKey: ParsedCellHistoryKey = {
			...exactKey,
			patientBucketKey: undefined,
			patientSubBucket: undefined,
		};
		const specificKey: ParsedCellHistoryKey = {
			...biologyKey,
			personnelId: undefined,
			specialtyId: undefined,
			facilityId: undefined,
		};
		const globalKey: ParsedCellHistoryKey = {
			tag,
			targetSchema: this.targetSchema,
			rawText: content,
		};

		const tiers = [
			{
				key: exactKey,
				tier: "exact" as const,
				weight: weights.exact,
			},
			{
				key: biologyKey,
				tier: "biology" as const,
				weight: weights.biology,
			},
			{
				key: specificKey,
				tier: "specific" as const,
				weight: weights.specific,
			},
			{
				key: globalKey,
				tier: "global" as const,
				weight: weights.global,
			},
		];

		const historyRows = await this.readWeightedCandidates(
			tiers,
			exactKey,
			historyStore,
		);
		const deduped = new Map<string, (typeof historyRows)[number]>();
		for (const row of historyRows) {
			const existing = deduped.get(row.candidate.cellId);
			if (!existing || existing.weight < row.weight) {
				deduped.set(row.candidate.cellId, row);
			}
		}
		return Array.from(deduped.values());
	}

	private async readWeightedCandidates(
		tiers: Array<{
			key: ParsedCellHistoryKey;
			tier: "exact" | "biology" | "specific" | "global";
			weight: number;
		}>,
		exactKey: ParsedCellHistoryKey,
		historyStore: ParsedCellHistoryStore,
	): Promise<
		Array<{
			candidate: ParsedCellObservationDetailV1;
			tier: "exact" | "biology" | "specific" | "global" | "adapter";
			weight: number;
		}>
	> {
		const weightedStore =
			historyStore as unknown as ParsedCellWeightedHistoryStore;
		if (typeof weightedStore.getWeightedObservationHistory === "function") {
			const candidates =
				await weightedStore.getWeightedObservationHistory(exactKey);
			return candidates.map((entry) => ({
				candidate: entry.candidate,
				tier: "adapter" as const,
				weight: entry.weight,
			}));
		}

		const historyRows = (
			await Promise.all(
				tiers.map(async (tier) => {
					const rows = await historyStore.getObservationHistory(tier.key);
					return rows.map((candidate) => ({ candidate, ...tier }));
				}),
			)
		).flat();
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
