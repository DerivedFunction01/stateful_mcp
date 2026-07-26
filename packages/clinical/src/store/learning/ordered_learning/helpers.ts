// Ordered learning helpers — shared by KV and SQL implementations

import type {
	OrderedLearningRelation,
	OrderedLearningRelationType,
	OrderedLearningToken,
} from "../interfaces";
import { ADJACENT_GAP_THRESHOLD, NEAR_GAP_THRESHOLD } from "../interfaces";

export function buildOrderedRelations(
	tokens: OrderedLearningToken[],
	cellId: string,
): OrderedLearningRelation[] {
	const relations: OrderedLearningRelation[] = [];
	const length = tokens.length;
	if (length < 2) return relations;

	for (let i = 0; i < length; i++) {
		const fromToken = tokens[i]!;
		for (let j = i + 1; j < length; j++) {
			const toToken = tokens[j]!;
			const gap = j - i;
			const normalizedGap = length > 1 ? gap / (length - 1) : 1;
			let relationType: OrderedLearningRelationType;

			if (gap <= ADJACENT_GAP_THRESHOLD) {
				relationType = "adjacent";
			} else if (gap <= NEAR_GAP_THRESHOLD) {
				relationType = "near";
			} else {
				relationType = "far";
			}

			relations.push({
				cellId,
				fromKey: fromToken.key,
				toKey: toToken.key,
				fromKind: fromToken.kind,
				toKind: toToken.kind,
				relationType,
				tokenGap: gap,
				normalizedGap,
			});

			relations.push({
				cellId,
				fromKey: toToken.key,
				toKey: fromToken.key,
				fromKind: toToken.kind,
				toKind: fromToken.kind,
				relationType: "after",
				tokenGap: gap,
				normalizedGap,
			});
		}
	}

	return relations;
}
