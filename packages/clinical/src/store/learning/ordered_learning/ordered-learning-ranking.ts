import type {
	OrderedLearningHistoryKey,
	OrderedLearningStore,
	OrderedLearningToken,
} from "../interfaces";
import { buildOrderedRelations } from "./helpers";
import type { OrderedLearningRankedCandidate } from "./ordered-learning-ranking-types";
import {
	buildSequenceSignature,
	extractAdjacentPairs,
	scoreAdjacentPairs,
	scoreRelations,
	scoreSequenceSignature,
} from "./ordered-learning-ranking-types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Default weight for adjacent-pair score in the combined score. */
export const ORDER_AWARE_ADJACENT_WEIGHT = 0.4;

/** Default weight for relation score in the combined score. */
export const ORDER_AWARE_RELATION_WEIGHT = 0.3;

/** Default weight for sequence-signature score in the combined score. */
export const ORDER_AWARE_SEQUENCE_WEIGHT = 0.3;

// ── Ranker ───────────────────────────────────────────────────────────────────

export interface OrderedLearningRankerContext {
	key: OrderedLearningHistoryKey;
	/** Tokens from the candidate parse, in resolution order. */
	candidateTokens: OrderedLearningToken[];
}

export interface OrderedLearningRankerOptions {
	adapterId?: string;
	adjacentWeight?: number;
	relationWeight?: number;
	sequenceWeight?: number;
}

export class OrderedLearningRanker {
	private readonly adjacentWeight: number;
	private readonly relationWeight: number;
	private readonly sequenceWeight: number;

	constructor(options: OrderedLearningRankerOptions = {}) {
		this.adjacentWeight = options.adjacentWeight ?? ORDER_AWARE_ADJACENT_WEIGHT;
		this.relationWeight = options.relationWeight ?? ORDER_AWARE_RELATION_WEIGHT;
		this.sequenceWeight = options.sequenceWeight ?? ORDER_AWARE_SEQUENCE_WEIGHT;
	}

	/**
	 * Ranks a single candidate against the ordered-learning history
	 * returned for the provided key.
	 */
	async rankCandidate(
		store: OrderedLearningStore,
		context: OrderedLearningRankerContext,
		options: OrderedLearningRankerOptions = {},
	): Promise<OrderedLearningRankedCandidate | null> {
		const history = await store.getHistory(context.key);
		if (history.length === 0) return null;

		const adapterId = options.adapterId ?? "default";
		const candidatePairs = extractAdjacentPairs(context.candidateTokens);
		const candidateRelations = buildOrderedRelations(
			context.candidateTokens,
			"candidate",
		);
		const candidateSignature = buildSequenceSignature(context.candidateTokens);

		const historyPairs = history
			.flatMap((record) => extractAdjacentPairs(record.orderedTokens))
			.filter((pair): pair is [string, string] => pair != null);
		const historyRelations = history.flatMap(
			(record) => record.relations ?? [],
		);
		const historySignatures = history
			.map((record) => buildSequenceSignature(record.orderedTokens))
			.filter((sig): sig is string => sig != null);

		const adjacentPairScore = scoreAdjacentPairs(candidatePairs, historyPairs);
		const relationScore = scoreRelations(candidateRelations, historyRelations);
		const sequenceSignatureScore = scoreSequenceSignature(
			candidateSignature,
			historySignatures,
		);

		const combinedScore =
			adjacentPairScore * this.adjacentWeight +
			relationScore * this.relationWeight +
			sequenceSignatureScore * this.sequenceWeight;

		const historyRecord = history[0]!;

		return {
			candidate: historyRecord,
			signals: {
				adjacentPairScore,
				relationScore,
				sequenceSignatureScore,
			},
			combinedScore,
			adapterId,
		};
	}
}
