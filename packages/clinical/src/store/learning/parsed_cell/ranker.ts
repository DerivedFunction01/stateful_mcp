import type {
	ParsedCellPreferenceMode,
	ParsedCellPreferenceProjection,
	ParsedCellPreferenceRanking,
	ParsedCellPreview,
	ParsedCellRanker,
	ParsedCellRankerContext,
	ParsedCellRankerScore,
	ParsedCellRecord,
} from "../interfaces";
import type { FieldWeightStore } from "./field-weight-store";
import { getTransformForSchema } from "./parsed-cell-record-transform";

const DEFAULT_WEIGHT = 1.0;
const ADJUSTMENT_RATE = 0.1;
const EPSILON = 1e-9;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectLeafPaths(
	obj: Record<string, unknown>,
	prefix = "",
	result: Map<string, unknown> = new Map(),
): Map<string, unknown> {
	for (const key of Object.keys(obj)) {
		const value = obj[key];
		const path = prefix ? `${prefix}.${key}` : key;

		if (isPlainObject(value)) {
			collectLeafPaths(value, path, result);
		} else if (value !== undefined && value !== null) {
			result.set(path, value);
		}
	}

	return result;
}

function computeProximityScore(
	candidateValue: number,
	historyValues: number[],
): number {
	if (historyValues.length === 0) {
		return 0;
	}

	if (historyValues.length === 1) {
		const single = historyValues[0];
		return candidateValue === single ? 1 : 0;
	}

	const mean =
		historyValues.reduce((sum, val) => sum + val, 0) / historyValues.length;
	const variance =
		historyValues.reduce((sum, val) => sum + (val - mean) ** 2, 0) /
		(historyValues.length - 1);
	const stdDev = Math.sqrt(variance);

	if (stdDev < EPSILON) {
		return candidateValue === mean ? 1 : 0;
	}

	return 1 / (1 + Math.abs(candidateValue - mean) / stdDev);
}

function compareLeafValues(
	candidateValue: unknown,
	historyValue: unknown,
	historyValues: number[],
): number {
	if (candidateValue == null || historyValue == null) {
		return candidateValue == null && historyValue == null ? 1 : 0;
	}

	if (typeof candidateValue === "number" && typeof historyValue === "number") {
		return computeProximityScore(candidateValue, historyValues);
	}

	return candidateValue === historyValue ? 1 : 0;
}

export class GenericPreferenceRanker
	implements ParsedCellRanker<ParsedCellRecord>
{
	private fieldWeights: Map<string, number>;
	private weightsLoaded = false;

	constructor(
		private readonly fieldWeightStore?: FieldWeightStore,
		options?: { fieldWeights?: Record<string, number> },
	) {
		this.adjustmentRate = ADJUSTMENT_RATE;
		this.fieldWeights = new Map();

		if (options?.fieldWeights) {
			for (const [path, weight] of Object.entries(options.fieldWeights)) {
				this.fieldWeights.set(path, weight);
			}
		}
	}

	private getWeight(path: string): number {
		if (!this.weightsLoaded) {
			return this.fieldWeights.get(path) ?? DEFAULT_WEIGHT;
		}
		return this.fieldWeights.get(path) ?? DEFAULT_WEIGHT;
	}

	async loadWeights(targetSchema: string): Promise<void> {
		if (!this.fieldWeightStore) {
			this.weightsLoaded = true;
			return;
		}
		const weights =
			await this.fieldWeightStore.getWeightsForSchema(targetSchema);
		this.fieldWeights = new Map(Object.entries(weights));
		this.weightsLoaded = true;
	}

	score(
		candidate: ParsedCellRecord,
		context: ParsedCellRankerContext,
	): ParsedCellRankerScore {
		const transform = getTransformForSchema(context.targetSchema);
		if (!transform) {
			return { score: 0, reason: "no-transform" };
		}

		const candidateFlat = transform.flatten(candidate.parsedItem);
		const candidateLeaves = collectLeafPaths(candidateFlat);

		if (candidateLeaves.size === 0 || context.history.length === 0) {
			return { score: 0, reason: "baseline" };
		}

		const allNumericHistory = new Map<string, number[]>();
		for (const historyRecord of context.history) {
			const historyFlat = transform.flatten(historyRecord.parsedItem);
			const historyLeaves = collectLeafPaths(historyFlat);
			for (const [path, value] of historyLeaves) {
				if (typeof value === "number") {
					const existing = allNumericHistory.get(path) ?? [];
					existing.push(value);
					allNumericHistory.set(path, existing);
				}
			}
		}

		let bestScore = 0;
		let bestReason = "baseline";

		for (const historyRecord of context.history) {
			const historyFlat = transform.flatten(historyRecord.parsedItem);
			const historyLeaves = collectLeafPaths(historyFlat);

			let recordScore = 0;
			const matchedPaths: string[] = [];

			for (const [path, candidateValue] of candidateLeaves) {
				const historyValue = historyLeaves.get(path);
				if (historyValue === undefined) continue;

				const weight = this.getWeight(path);
				const numericValues = allNumericHistory.get(path) ?? [];
				const matchScore = compareLeafValues(
					candidateValue,
					historyValue,
					numericValues,
				);

				if (matchScore > 0) {
					recordScore += weight * matchScore;
					matchedPaths.push(path);
				}
			}

			if (recordScore > bestScore) {
				bestScore = recordScore;
				bestReason = matchedPaths.join(",") || "baseline";
			}
		}

		return { score: bestScore, reason: bestReason };
	}

	choose(
		deterministic: ParsedCellRecord | null,
		learned: ParsedCellRecord | null,
		context: ParsedCellRankerContext,
		mode: ParsedCellPreferenceMode = "dual",
	): ParsedCellPreferenceProjection<ParsedCellRecord> {
		const deterministicScore = deterministic
			? this.score(deterministic, context)
			: undefined;
		const learnedScore = learned ? this.score(learned, context) : undefined;

		let winner: ParsedCellRecord | null = null;

		if (mode === "deterministic") {
			winner = deterministic;
		} else if (mode === "learned") {
			winner = learned;
		} else if ((learnedScore?.score ?? 0) >= (deterministicScore?.score ?? 0)) {
			winner = learned;
		} else {
			winner = deterministic;
		}

		return {
			mode,
			deterministic,
			learned,
			winner,
			deterministicScore,
			learnedScore,
		};
	}

	rankMany(
		candidates: Array<{
			candidate: ParsedCellRecord;
			source: "deterministic" | "learned";
		}>,
		context: ParsedCellRankerContext,
		mode: ParsedCellPreferenceMode = "dual",
	): ParsedCellPreferenceRanking<ParsedCellRecord> {
		const scored = candidates
			.map((entry) => ({
				candidate: entry.candidate,
				score: this.score(entry.candidate, context),
				source: entry.source,
			}))
			.sort((a, b) => b.score.score - a.score.score);

		if (mode === "deterministic") {
			const deterministic = scored.find(
				(row) => row.source === "deterministic",
			);
			return {
				mode,
				candidates: deterministic ? [deterministic] : [],
				winner: deterministic?.candidate || null,
			};
		}

		if (mode === "learned") {
			const learned = scored.find((row) => row.source === "learned");
			return {
				mode,
				candidates: learned ? [learned] : [],
				winner: learned?.candidate || null,
			};
		}

		return {
			mode,
			candidates: scored,
			winner: scored[0]?.candidate || null,
		};
	}

	previewMany(
		candidates: Array<{
			candidate: ParsedCellRecord;
			source: "deterministic" | "learned";
		}>,
		context: ParsedCellRankerContext,
		mode: ParsedCellPreferenceMode = "dual",
	): ParsedCellPreview<ParsedCellRecord> {
		const ranking = this.rankMany(candidates, context, mode);

		return {
			deterministic: candidates
				.filter((entry) => entry.source === "deterministic")
				.map((entry) => entry.candidate),
			learned: candidates
				.filter((entry) => entry.source === "learned")
				.map((entry) => entry.candidate),
			ranking,
		};
	}

	async adjustWeights(
		candidate: ParsedCellRecord,
		context: ParsedCellRankerContext,
		accepted: boolean,
	): Promise<void> {
		if (!this.fieldWeightStore) return;

		const transform = getTransformForSchema(context.targetSchema);
		if (!transform) return;

		const candidateFlat = transform.flatten(candidate.parsedItem);
		const candidateLeaves = collectLeafPaths(candidateFlat);

		let bestHistory: ParsedCellRecord | undefined;
		let bestScore = -Infinity;

		for (const historyRecord of context.history) {
			const scoreResult = this.score(candidate, {
				...context,
				history: [historyRecord],
			});
			if (scoreResult.score > bestScore) {
				bestScore = scoreResult.score;
				bestHistory = historyRecord;
			}
		}

		if (!bestHistory) return;

		const historyFlat = transform.flatten(bestHistory.parsedItem);
		const historyLeaves = collectLeafPaths(historyFlat);

		for (const [path] of candidateLeaves) {
			if (historyLeaves.has(path)) {
				await this.fieldWeightStore.adjustWeight(
					context.targetSchema,
					path,
					accepted ? ADJUSTMENT_RATE : -ADJUSTMENT_RATE,
				);
			}
		}

		await this.loadWeights(context.targetSchema);
	}

	getFieldWeights(): Record<string, number> {
		const result: Record<string, number> = {};
		for (const [path, weight] of this.fieldWeights) {
			result[path] = weight;
		}
		return result;
	}

	setFieldWeights(weights: Record<string, number>): void {
		this.fieldWeights.clear();
		for (const [path, weight] of Object.entries(weights)) {
			this.fieldWeights.set(path, weight);
		}
		this.weightsLoaded = true;
	}
}
