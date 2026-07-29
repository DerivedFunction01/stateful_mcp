import type { ParsedItem } from "../../../parser/schema-parsers";
import type {
	ClinicalParseConfidenceScorer,
	ParsedCellRankerContext,
	ScoredParsedItem,
	SystemWeightStore,
} from "../interfaces";
import { getTransformForSchema } from "./parsed-cell-record-transform";

const DEFAULT_COMPLETENESS_WEIGHT = 0.3;
const DEFAULT_CONCEPT_WEIGHT = 0.3;
const DEFAULT_TYPE_WEIGHT = 0.2;
const DEFAULT_HISTORY_WEIGHT = 0.2;

export class GenericConfidenceScorer implements ClinicalParseConfidenceScorer {
	constructor(
		private readonly weightStore?: SystemWeightStore,
		private readonly historyStore?: {
			getHistoryBySchema(targetSchema: string, key: any): Promise<any[]>;
		},
	) {}

	async scoreCandidate(
		candidate: ParsedItem,
		context: ParsedCellRankerContext,
	): Promise<ScoredParsedItem> {
		const targetSchema = candidate.targetSchema;

		// 1. Resolve weights dynamically from SystemWeightStore
		let wCompleteness = DEFAULT_COMPLETENESS_WEIGHT;
		let wConcept = DEFAULT_CONCEPT_WEIGHT;
		let wType = DEFAULT_TYPE_WEIGHT;
		let wHistory = DEFAULT_HISTORY_WEIGHT;

		if (this.weightStore) {
			wCompleteness = await this.weightStore.getWeight(
				"parse_confidence",
				"default",
				"completeness",
			);
			wConcept = await this.weightStore.getWeight(
				"parse_confidence",
				"default",
				"concept",
			);
			wType = await this.weightStore.getWeight(
				"parse_confidence",
				"default",
				"type",
			);
			wHistory = await this.weightStore.getWeight(
				"parse_confidence",
				"default",
				"history",
			);
		}

		// 2. Completeness Score
		const transform = getTransformForSchema(targetSchema);
		let completeness = 0.0;
		if (transform) {
			const flat = transform.flatten(candidate);
			const expectedFields = (transform.columnSpecs || []).map((c) => c.name);
			if (expectedFields.length > 0) {
				let populated = 0;
				for (const field of expectedFields) {
					if (
						flat[field] !== undefined &&
						flat[field] !== null &&
						flat[field] !== ""
					) {
						populated++;
					}
				}
				completeness = populated / expectedFields.length;
			}
		}

		// 3. Concept Coherence Score
		let conceptCoherence = 0.2;
		const primaryConcept = candidate.concept?.[0];
		if (primaryConcept?.conceptId) {
			const ns = primaryConcept.conceptId.split("::")[0];
			if (targetSchema === "VitalsMeasurementEvent" && ns === "LOINC") {
				conceptCoherence = 1.0;
			} else if (targetSchema === "MedicationOrderObject" && ns === "RxNorm") {
				conceptCoherence = 1.0;
			} else if (targetSchema === "ObservationEvent" && ns === "SNOMED") {
				conceptCoherence = 1.0;
			} else if (ns) {
				conceptCoherence = 0.6; // some related namespace
			}
		} else {
			// Schema doesn't require a concept
			if (targetSchema === "ClinicalDateRange") {
				conceptCoherence = 1.0;
			}
		}

		// 4. Type Coherence Score
		let typeCoherence = 0.5;
		const data = candidate.extractedData || {};
		if (targetSchema === "VitalsMeasurementEvent") {
			const hasMagnitude = typeof data.measurement?.magnitude === "number";
			const hasVitalType = typeof data.vitalType?.conceptId === "string";
			typeCoherence = hasMagnitude && hasVitalType ? 1.0 : 0.1;
		} else if (targetSchema === "MedicationOrderObject") {
			const hasMed = typeof data.medication?.conceptId === "string";
			const hasDosage =
				typeof data.dosage?.text === "string" ||
				typeof data.dosage?.dose === "number";
			const hasFrequency = typeof data.frequency?.text === "string";
			typeCoherence = hasMed && (hasDosage || hasFrequency) ? 1.0 : 0.2;
		} else if (targetSchema === "ObservationEvent") {
			const hasConcept = typeof candidate.concept?.[0]?.conceptId === "string";
			typeCoherence = hasConcept ? 1.0 : 0.3;
		}

		// 5. Historical Preference Score
		let historicalPreference = 0.0;
		if (this.historyStore) {
			const historyKey = {
				tag: context.tag,
				targetSchema,
				rawText: context.rawText,
			};
			const matches = await this.historyStore.getHistoryBySchema(
				targetSchema,
				historyKey,
			);
			if (matches.length > 0) {
				historicalPreference = 1.0; // simple match in past successful parses
			}
		}

		// Combine scores using resolved weights
		const rawScore =
			completeness * wCompleteness +
			conceptCoherence * wConcept +
			typeCoherence * wType +
			historicalPreference * wHistory;

		// Normalize score to [0.0, 1.0] range
		const totalWeight = wCompleteness + wConcept + wType + wHistory;
		const confidenceScore =
			totalWeight > 0
				? Math.min(1.0, Math.max(0.0, rawScore / totalWeight))
				: 0.0;

		return {
			parsedItem: candidate,
			confidenceScore,
			breakdown: {
				completeness,
				conceptCoherence,
				typeCoherence,
				historicalPreference,
			},
		};
	}
}
