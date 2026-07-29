import { describe, expect, it } from "bun:test";
import { GenericConfidenceScorer } from "../../src/store/learning/parsed_cell/confidence-scorer";
import "../../src/store/learning/parsed_cell/transforms/observation-transform";
import type { ParsedItem } from "../../src/parser/schema-parsers";
import type { SystemWeightStore } from "../../src/store/learning/interfaces";

class MockWeightStore implements SystemWeightStore {
	private weights: Record<string, number> = {};

	setWeights(map: Record<string, number>) {
		this.weights = map;
	}

	async getWeight(
		category: string,
		key: string,
		subKey?: string,
	): Promise<number> {
		return this.weights[subKey ?? ""] ?? 1.0;
	}

	async setWeight(
		category: string,
		key: string,
		value: number,
		subKey?: string,
	): Promise<void> {
		this.weights[subKey ?? ""] = value;
	}

	async adjustWeight(
		category: string,
		key: string,
		delta: number,
		subKey?: string,
	): Promise<void> {}

	async getWeightsForCategory(
		category: string,
		key: string,
	): Promise<Record<string, number>> {
		return this.weights;
	}
}

describe("GenericConfidenceScorer", () => {
	it("should calculate correct completeness score based on schema columns", async () => {
		const scorer = new GenericConfidenceScorer();
		const candidate: ParsedItem = {
			targetSchema: "ObservationEvent",
			attributes: {},
			concept: [],
			rawText: "chest pain",
			tag: "ObservationEvent",
			extractedData: {
				certainty: "confirmed",
			},
		};

		const context = {
			tag: "ObservationEvent",
			targetSchema: "ObservationEvent",
			rawText: "chest pain",
			history: [],
		};

		const result = await scorer.scoreCandidate(candidate, context);
		expect(result.breakdown.completeness).toBeGreaterThan(0.0);
		expect(result.breakdown.completeness).toBeLessThan(1.0);
	});

	it("should score concept coherence correctly based on namespace", async () => {
		const scorer = new GenericConfidenceScorer();
		const candidate: ParsedItem = {
			targetSchema: "VitalsMeasurementEvent",
			attributes: {},
			concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
			rawText: "temp 38",
			tag: "VitalsMeasurementEvent",
			extractedData: {},
		};

		const context = {
			tag: "VitalsMeasurementEvent",
			targetSchema: "VitalsMeasurementEvent",
			rawText: "temp 38",
			history: [],
		};

		const result = await scorer.scoreCandidate(candidate, context);
		expect(result.breakdown.conceptCoherence).toBe(1.0);
	});

	it("should use dynamic weights from SystemWeightStore when present", async () => {
		const ws = new MockWeightStore();
		ws.setWeights({
			completeness: 0.1,
			concept: 0.1,
			type: 0.7,
			history: 0.1,
		});

		const scorer = new GenericConfidenceScorer(ws);
		const candidate: ParsedItem = {
			targetSchema: "VitalsMeasurementEvent",
			attributes: {},
			concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
			rawText: "temp 38",
			tag: "VitalsMeasurementEvent",
			extractedData: {
				measurement: { magnitude: 38 },
				vitalType: { conceptId: "LOINC::8310-5" },
			},
		};

		const context = {
			tag: "VitalsMeasurementEvent",
			targetSchema: "VitalsMeasurementEvent",
			rawText: "temp 38",
			history: [],
		};

		const result = await scorer.scoreCandidate(candidate, context);
		expect(result.breakdown.typeCoherence).toBe(1.0);
		// Type has 0.7 weight, typeCoherence is 1.0, conceptCoherence is 1.0
		expect(result.confidenceScore).toBeGreaterThanOrEqual(0.8);
	});
});
