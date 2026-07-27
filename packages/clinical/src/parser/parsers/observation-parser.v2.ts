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
import type { ParsedCellHistoryStore } from "../../store/learning/interfaces.v2";
import { ObservationTokenizer } from "../helpers/observation-helper";
import {
	CANONICAL_TAGS,
	type ParsedCandidateEnvelope,
	type ParsedItemUnion,
	type ParsedObservationItem,
	type PreparsedContext,
	resolveConceptHelper,
	type SchemaParser,
} from "../schema-parsers.v2";

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
				(item): item is ParsedObservationItem =>
					item !== null && item.targetSchema === "ObservationEvent",
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

		const defaultSeverity =
			conceptDefaults?.defaultProperties.severity || severity;
		const defaultCertainty =
			conceptDefaults?.defaultProperties.certainty || certainty;
		const defaultStatus = conceptDefaults?.defaultProperties.status || status;

		const attributes: Record<string, any> = {};
		if (certainty) attributes.certainty = certainty;
		if (status) attributes.status = status;
		if (severity) attributes.severity = severity;
		if (token.severityScore) attributes.severityScore = token.severityScore;

		const extractedData: Record<string, any> = {
			certainty: defaultCertainty || resolvedCertainty,
			status: defaultStatus || resolvedStatus,
			severity: defaultSeverity || resolvedSeverity,
		};

		return {
			targetSchema: this.targetSchema,
			attributes,
			concept,
			rawText: `${tag} ${content}`,
			tag,
			extractedData,
		} as ParsedObservationItem;
	}
}
