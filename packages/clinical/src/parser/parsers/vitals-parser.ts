import type { DictionaryStore } from "@stateful-mcp/core";
import { isBoundedMeasurement } from "../../schemas/measurement";
import { resolveSchemaDefault } from "../../store/default-strategy";
import { DEFAULT_EVALUATOR_RULES } from "../../store/defaults";
import type {
	AttributeParserRule,
	ParserConceptDefault,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
} from "../../store/interfaces";
import type {
	ParsedCellHistoryKey,
	ParsedCellVitalsDetail,
} from "../../store/learning/interfaces";
import type { ParsedCellHistoryStore } from "../../store/learning/parsed_cell/history-store";
import type { ParsedCellRankerContext } from "../../store/learning/parsed_cell/parsed-cell-ranking-types";
import { VitalsPreferenceRanker } from "../../store/learning/parsed_cell/vitals/parsed-cell-ranking";
import { buildVitalsShape } from "../../store/learning/parsed_cell/vitals/shape";
import { getCompiledRegex } from "../_compiled-regex";
import {
	MeasurementHelper,
	QuantityHelper,
	QuantityTokenizer,
} from "../helpers/measurement-helper";
import { VitalsHelper, VitalsTokenizer } from "../helpers/vitals-helper";
import {
	CANONICAL_TAGS,
	type ParsedCandidateEnvelope,
	type ParsedItem,
	type ParsedVitalsItem,
	type PreparsedContext,
	resolveConceptHelper,
	type SchemaParser,
} from "../schema-parsers";

export class VitalsSchemaParser implements SchemaParser {
	targetSchema = CANONICAL_TAGS.VITALS;
	private readonly ranker: VitalsPreferenceRanker =
		new VitalsPreferenceRanker();

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
		historyStore?: ParsedCellHistoryStore<ParsedCellVitalsDetail>,
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
			.filter((item): item is ParsedVitalsItem => item !== null);

		const vitalsDeterministic =
			deterministic?.targetSchema === "VitalsMeasurementEvent"
				? (deterministic as ParsedVitalsItem)
				: null;
		const context = this.buildRankerContext(
			preparsedContext,
			content,
			vitalsDeterministic,
		);

		const deterministicDetail = vitalsDeterministic
			? this.toVitalsDetail(vitalsDeterministic)
			: null;
		const learnedDetails = learned
			.map((item) => this.toVitalsDetail(item))
			.filter((d): d is ParsedCellVitalsDetail => d !== null);

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
		const rules = evaluatorRules || DEFAULT_EVALUATOR_RULES;

		let token: any = null;
		if (
			preparsedContext?.measurement &&
			preparsedContext.measurement.length > 0
		) {
			const m = preparsedContext.measurement.find((candidate) => {
				const parsed = MeasurementHelper.parse(
					candidate,
					undefined,
					attributeRules,
				);
				return parsed !== null && isBoundedMeasurement(parsed);
			});
			if (!m) return null;
			const parsedMeasurement = MeasurementHelper.parse(
				m,
				undefined,
				attributeRules,
			);
			token = {
				anchorText: content.trim(),
				value: m.magnitude,
				unit: parsedMeasurement?.unit?.display || m.rawUnit,
			};
		} else {
			token = VitalsTokenizer.tokenize(content, rules);
		}
		if (!token || !token.anchorText) return null;

		const capturedProps: Record<string, any> = {};
		if (token.systolic !== undefined && token.diastolic !== undefined) {
			const bp = VitalsHelper.buildBloodPressure(
				token.systolic,
				token.diastolic,
				token.bloodPressureUnit,
			);
			capturedProps.systolic = bp.systolic;
			capturedProps.diastolic = bp.diastolic;
			capturedProps.unit = bp.unit;
		}
		if (token.value !== undefined) {
			capturedProps.quantity = token.value;
			if (token.unit) capturedProps.unit = token.unit;
		}

		let valueText = token.value !== undefined ? String(token.value) : "";
		let unitText = token.unit || "";
		if (token.systolic !== undefined && token.diastolic !== undefined) {
			valueText = `${token.systolic}/${token.diastolic}`;
			unitText = token.bloodPressureUnit || "mmHg";
		}

		// Resolve concept
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

		// Apply regex capture groups from defaults if defined
		if (conceptDefaults?.regexPatterns) {
			for (const pattern of conceptDefaults.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(content);
				if (
					match &&
					match.groups &&
					conceptDefaults.defaultProperties.captureGroupMapping
				) {
					const mapping: string[] =
						conceptDefaults.defaultProperties.captureGroupMapping;
					for (let i = 0; i < mapping.length; i++) {
						const field = mapping[i];
						if (field) {
							const val = match.groups?.[field];
							if (val !== undefined) {
								capturedProps[field] = val;
								if (field === "value") valueText = val;
								if (field === "unit") unitText = val;
							}
						}
					}
				}
			}
		}

		const defaultUnit = conceptDefaults?.defaultProperties.unit || "";
		const fallbackUnit =
			resolveSchemaDefault<string>(
				this.targetSchema,
				"unit",
				preparsedContext?.profile,
				{ rawText: content, parsedPartial: { unit: unitText || defaultUnit } },
			) ||
			unitText ||
			defaultUnit;
		const parsedVal = Number.isNaN(Number(valueText))
			? valueText
			: Number(valueText);

		const finalUnit = fallbackUnit;
		let unitAnchor: string | undefined;
		if (finalUnit) {
			const unitResolution = QuantityTokenizer.resolveUnit(
				finalUnit,
				attributeRules,
			);
			if (unitResolution && QuantityHelper.isPhysicalResolved(unitResolution)) {
				unitAnchor = unitResolution.unitAnchor;
			}
		}

		return {
			tag,
			anchorText: token.anchorText,
			conceptId,
			display,
			value: parsedVal,
			unit: finalUnit,
			unitAnchor,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProps).length > 0 ? capturedProps : undefined,
		} as ParsedVitalsItem;
	}

	private toVitalsDetail(
		item: ParsedVitalsItem,
	): ParsedCellVitalsDetail | null {
		const shape = buildVitalsShape(item);
		return {
			targetSchema: "VitalsMeasurementEvent",
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
		deterministic: ParsedVitalsItem | null,
	): ParsedCellRankerContext {
		const shape = deterministic
			? buildVitalsShape(deterministic)
			: { schema: "VitalsMeasurementEvent" as const, slots: {} };
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
