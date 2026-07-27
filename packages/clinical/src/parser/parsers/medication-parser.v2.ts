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
import type { ParsedCellHistoryStore } from "../../store/learning/interfaces.v2";
import { MedicationTokenizer } from "../helpers/medication-helper";
import {
	CANONICAL_TAGS,
	type ParsedCandidateEnvelope,
	type ParsedItemUnion,
	type ParsedMedicationItem,
	type PreparsedContext,
	resolveConceptHelper,
	type SchemaParser,
} from "../schema-parsers.v2";

export class MedicationSchemaParser implements SchemaParser {
	targetSchema = CANONICAL_TAGS.MEDICATION;

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
	): Promise<ParsedCandidateEnvelope> {
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
		const key = {
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
			.filter(
				(item): item is ParsedMedicationItem =>
					item !== null && item.targetSchema === "MedicationOrderObject",
			);

		const medDeterministic =
			deterministic?.targetSchema === "MedicationOrderObject"
				? (deterministic as ParsedMedicationItem)
				: null;

		return {
			deterministic: medDeterministic ? [medDeterministic] : [],
			learned:
				learned.length > 0
					? learned
					: medDeterministic
						? [medDeterministic]
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
	): Promise<ParsedItemUnion | null> {
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

		const concept = await resolveConceptHelper(
			token.anchorText,
			dictionaryStore,
			termTokenizer,
			allowedNamespaces,
		);
		const display = concept[0]?.display || token.anchorText;

		let conceptDefaults: ParserConceptDefault | null = null;
		const firstConcept = concept[0];
		if (firstConcept?.conceptId && conceptDefaultsStore) {
			conceptDefaults = await conceptDefaultsStore.get(
				firstConcept.conceptId,
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

		const attributes: Record<string, any> = {};
		if (route) attributes.route = route;
		if (frequency) attributes.frequency = frequency;

		const capturedProperties: Record<string, any> = {};
		if (token.quantity !== undefined) {
			capturedProperties.quantity = token.quantity;
			if (token.quantityUnit) {
				capturedProperties.unit = token.quantityUnit;
			}
			attributes.quantity = token.quantity;
			if (token.quantityUnit) attributes.quantityUnit = token.quantityUnit;
		}

		const extractedData: Record<string, any> = {
			route,
			frequency,
		};
		if (token.quantity !== undefined) {
			extractedData.quantity = token.quantity;
			if (token.quantityUnit) extractedData.quantityUnit = token.quantityUnit;
		}

		return {
			targetSchema: this.targetSchema,
			attributes,
			concept,
			rawText: `${tag} ${content}`,
			tag,
			extractedData,
		} as ParsedMedicationItem;
	}
}
