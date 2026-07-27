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
import type {
	ParsedCellHistoryKey,
	ParsedCellMedicationDetail,
} from "../../store/learning/interfaces";
import type { ParsedCellHistoryStore } from "../../store/learning/parsed_cell/history-store";
import { MedicationPreferenceRanker } from "../../store/learning/parsed_cell/medication/parsed-cell-ranking";
import { buildMedicationShape } from "../../store/learning/parsed_cell/medication/shape";
import type { ParsedCellRankerContext } from "../../store/learning/parsed_cell/parsed-cell-ranking-types";
import { MedicationTokenizer } from "../helpers/medication-helper";
import {
	CANONICAL_TAGS,
	type ParsedCandidateEnvelope,
	type ParsedItem,
	type ParsedMedicationItem,
	type PreparsedContext,
	resolveConceptHelper,
	type SchemaParser,
} from "../schema-parsers";

export class MedicationSchemaParser implements SchemaParser {
	targetSchema = CANONICAL_TAGS.MEDICATION;
	private readonly ranker: MedicationPreferenceRanker =
		new MedicationPreferenceRanker();

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
		historyStore?: ParsedCellHistoryStore<ParsedCellMedicationDetail>,
	): Promise<ParsedCandidateEnvelope<ParsedItem>> {
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
		const key: ParsedCellHistoryKey = {
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
		const historyRows = historyStore ? await historyStore.getHistory(key) : [];
		const learned = historyRows
			.map((row) => row.parsedItem)
			.filter((item): item is ParsedMedicationItem => item !== null);

		const medDeterministic =
			deterministic?.targetSchema === "MedicationOrderObject"
				? (deterministic as ParsedMedicationItem)
				: null;
		const context = this.buildRankerContext(
			preparsedContext,
			content,
			medDeterministic,
		);

		const deterministicDetail = medDeterministic
			? this.toMedicationDetail(medDeterministic)
			: null;
		const learnedDetails = learned
			.map((item) => this.toMedicationDetail(item))
			.filter((d): d is ParsedCellMedicationDetail => d !== null);

		const projection = this.ranker.choose(
			deterministicDetail,
			learnedDetails[0] ?? null,
			context,
			"dual",
		);

		return {
			deterministic: projection.deterministic
				? [projection.deterministic.parsedItem]
				: [],
			learned: projection.learned
				? [projection.learned.parsedItem]
				: projection.deterministic
					? [projection.deterministic.parsedItem]
					: [],
		};
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
				route: preparsedContext.attributes.route,
			};
		} else {
			token = MedicationTokenizer.tokenize(content, attrRules, evalRules);
		}
		if (!token || !token.anchorText) return null;

		let route = token.route;
		let frequency = preparsedContext?.frequency;

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
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProperties).length > 0
					? capturedProperties
					: undefined,
		} as ParsedMedicationItem;
	}

	private toMedicationDetail(
		item: ParsedMedicationItem,
	): ParsedCellMedicationDetail | null {
		const shape = buildMedicationShape(item);
		return {
			targetSchema: "MedicationOrderObject",
			cellId: "",
			conceptId: item.conceptId,
			display: item.display,
			candidateTokens: [],
			shape,
			parsedItem: item,
		};
	}

	private buildRankerContext(
		preparsedContext: PreparsedContext | undefined,
		content: string,
		deterministic: ParsedMedicationItem | null,
	): ParsedCellRankerContext {
		const shape = deterministic
			? buildMedicationShape(deterministic)
			: { schema: "MedicationOrderObject" as const, slots: {} };
		return {
			tag: preparsedContext?.rankingSignals?.tag || this.targetSchema,
			targetSchema: this.targetSchema,
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
			rawText: content,
			anchorText: content,
			candidateTokens: [],
			sharedShape: shape,
		};
	}
}
