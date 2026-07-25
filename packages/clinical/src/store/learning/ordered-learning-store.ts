import type { ParsedObservationItem } from "../../parser/schema-parsers";
import { scoreRecency } from "./parsed-cell-store";

// ── Types ────────────────────────────────────────────────────────────────────

export type OrderedLearningTokenKind = "tag" | "field" | "concept" | "signal";

export interface OrderedLearningToken {
	kind: OrderedLearningTokenKind;
	key: string;
	value?: string;
	index: number;
}

export type OrderedLearningRelationType =
	| "before"
	| "after"
	| "adjacent"
	| "near"
	| "far";

export interface OrderedLearningRelation {
	cellId: string;
	fromKey: string;
	toKey: string;
	fromKind: OrderedLearningTokenKind;
	toKind: OrderedLearningTokenKind;
	relationType: OrderedLearningRelationType;
	tokenGap: number;
	normalizedGap: number;
}

export interface OrderedLearningRecord {
	cellId: string;
	soapNoteId?: string;
	tag: string;
	targetSchema: string;
	rawText: string;
	patientId?: string;
	patientOrganismType?: string;
	patientGender?: string;
	patientAgeBucket?: string;
	patientSpeciesBucket?: string;
	patientSubBucket?: number;
	patientBucketKey?: string;
	personnelId?: string;
	specialtyId?: string;
	facilityId?: string;
	featureBag?: Record<string, string | number | boolean | null>;
	orderedTokens: OrderedLearningToken[];
	relations?: OrderedLearningRelation[];
	parsedItem: ParsedObservationItem;
	history?: {
		priorAcceptCount?: number;
		priorCorrectionCount?: number;
		lastAcceptedAt?: string;
		lastCorrectedAt?: string;
		recencyScore?: number;
	};
	flags?: {
		contractValid?: boolean;
		stalePreference?: boolean;
		reviewRequired?: boolean;
	};
}

export interface OrderedLearningRecordInput {
	shared: {
		cellId: string;
		soapNoteId?: string;
		tag: string;
		targetSchema: string;
		rawText: string;
		patientId?: string;
		patientOrganismType?: string;
		patientGender?: string;
		patientAgeBucket?: string;
		patientSpeciesBucket?: string;
		patientSubBucket?: number;
		patientBucketKey?: string;
		personnelId?: string;
		specialtyId?: string;
		facilityId?: string;
		acceptedAt?: string;
	};
	parsedItem: ParsedObservationItem;
	orderedTokens: OrderedLearningToken[];
}

export interface OrderedLearningHistoryKey {
	soapNoteId?: string;
	patientId?: string;
	patientOrganismType?: string;
	patientGender?: string;
	patientAgeBucket?: string;
	patientSpeciesBucket?: string;
	patientSubBucket?: number;
	patientBucketKey?: string;
	personnelId?: string;
	specialtyId?: string;
	facilityId?: string;
	tag: string;
	targetSchema: string;
	rawText: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of ordered tokens to store per record. */
export const MAX_ORDERED_TOKENS = 512;

/** Tokens within this gap are considered "adjacent". */
export const ADJACENT_GAP_THRESHOLD = 1;

/** Tokens within this gap (exclusive of adjacent) are considered "near". */
export const NEAR_GAP_THRESHOLD = 5;

// ── Store Interface ──────────────────────────────────────────────────────────

export interface OrderedLearningStore {
	getOrderedObservationHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningRecord[]>;
	putOrderedObservation(record: OrderedLearningRecordInput): Promise<void>;
	markOrderedObservationCorrection(
		cellId: string,
		replacement?: OrderedLearningRecordInput["parsedItem"],
	): Promise<void>;
}

// ── Feature Helpers ──────────────────────────────────────────────────────────

/**
 * Derives pairwise relative-distance relations from an ordered token sequence.
 *
 * For each pair of tokens (i, j) where i < j, produces a relation describing
 * their relative position. Uses exact token gap to classify as:
 * - adjacent (gap === 1)
 * - near (gap <= NEAR_GAP_THRESHOLD)
 * - far (gap > NEAR_GAP_THRESHOLD)
 *
 * Also includes a "before" relation for every pair and an "after" relation
 * for the reverse direction, so the full pairwise matrix is available.
 */
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

			// before: from i to j
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

			// after: from j to i
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

// ── Composite Store ──────────────────────────────────────────────────────────

export interface OrderedLearningStoreAdapter {
	adapterId: string;
	weight: number;
	store: OrderedLearningStore;
}

export interface OrderedLearningWeightedCandidate {
	candidate: OrderedLearningRecord;
	adapterId: string;
	weight: number;
}

export interface OrderedLearningWeightedStore {
	getWeightedOrderedObservationHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningWeightedCandidate[]>;
}

export class CompositeOrderedLearningStore
	implements OrderedLearningStore, OrderedLearningWeightedStore
{
	constructor(private adapters: OrderedLearningStoreAdapter[]) {}

	async getWeightedOrderedObservationHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningWeightedCandidate[]> {
		const results = await Promise.all(
			this.adapters.map(async (adapter) => {
				const rows = await adapter.store.getOrderedObservationHistory(key);
				return rows.map((candidate) => ({
					candidate,
					adapterId: adapter.adapterId,
					weight: adapter.weight,
				}));
			}),
		);
		return results.flat();
	}

	async getOrderedObservationHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningRecord[]> {
		return (await this.getWeightedOrderedObservationHistory(key)).map(
			(entry) => entry.candidate,
		);
	}

	async putOrderedObservation(
		record: OrderedLearningRecordInput,
	): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) =>
				adapter.store.putOrderedObservation(record),
			),
		);
	}

	async markOrderedObservationCorrection(
		cellId: string,
		replacement?: OrderedLearningRecordInput["parsedItem"],
	): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) =>
				adapter.store.markOrderedObservationCorrection(cellId, replacement),
			),
		);
	}
}

// ── Memory Implementation ────────────────────────────────────────────────────

export class MemoryOrderedLearningStore implements OrderedLearningStore {
	private records = new Map<string, OrderedLearningRecord>();

	async getOrderedObservationHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningRecord[]> {
		return Array.from(this.records.values())
			.filter((row) => row.targetSchema === key.targetSchema)
			.filter((row) => row.tag === key.tag)
			.filter((row) => {
				if (key.patientId && row.patientId !== key.patientId) return false;
				if (
					key.patientOrganismType &&
					row.patientOrganismType !== key.patientOrganismType
				)
					return false;
				if (key.patientGender && row.patientGender !== key.patientGender)
					return false;
				if (
					key.patientAgeBucket &&
					row.patientAgeBucket !== key.patientAgeBucket
				)
					return false;
				if (
					key.patientSpeciesBucket &&
					row.patientSpeciesBucket !== key.patientSpeciesBucket
				)
					return false;
				if (
					key.patientSubBucket !== undefined &&
					row.patientSubBucket !== key.patientSubBucket
				)
					return false;
				if (
					key.patientBucketKey &&
					row.patientBucketKey !== key.patientBucketKey
				)
					return false;
				if (key.personnelId && row.personnelId !== key.personnelId)
					return false;
				if (key.specialtyId && row.specialtyId !== key.specialtyId)
					return false;
				if (key.facilityId && row.facilityId !== key.facilityId) return false;
				if (row.rawText !== key.rawText) return false;
				return true;
			})
			.sort(
				(a, b) =>
					(b.history?.recencyScore ?? 0) - (a.history?.recencyScore ?? 0),
			);
	}

	async putOrderedObservation(
		record: OrderedLearningRecordInput,
	): Promise<void> {
		const existing = this.records.get(record.shared.cellId);
		const now = new Date().toISOString();

		const orderedTokens = record.orderedTokens.slice(0, MAX_ORDERED_TOKENS);
		const relations = buildOrderedRelations(
			orderedTokens,
			record.shared.cellId,
		);

		const full: OrderedLearningRecord = {
			cellId: record.shared.cellId,
			soapNoteId: record.shared.soapNoteId,
			tag: record.shared.tag,
			targetSchema: record.shared.targetSchema,
			rawText: record.shared.rawText,
			patientId: record.shared.patientId,
			patientOrganismType: record.shared.patientOrganismType,
			patientGender: record.shared.patientGender,
			patientAgeBucket: record.shared.patientAgeBucket,
			patientSpeciesBucket: record.shared.patientSpeciesBucket,
			patientSubBucket: record.shared.patientSubBucket,
			patientBucketKey: record.shared.patientBucketKey,
			personnelId: record.shared.personnelId,
			specialtyId: record.shared.specialtyId,
			facilityId: record.shared.facilityId,
			orderedTokens,
			relations,
			parsedItem: record.parsedItem,
			history: {
				priorAcceptCount: (existing?.history?.priorAcceptCount || 0) + 1,
				priorCorrectionCount: existing?.history?.priorCorrectionCount || 0,
				lastAcceptedAt: record.shared.acceptedAt ?? now,
				lastCorrectedAt: existing?.history?.lastCorrectedAt,
				recencyScore: scoreRecency(record.shared.acceptedAt ?? now),
			},
			flags: {
				contractValid: true,
				stalePreference: !!existing?.history?.priorCorrectionCount,
				reviewRequired: false,
			},
		};

		this.records.set(record.shared.cellId, full);
	}

	async markOrderedObservationCorrection(
		cellId: string,
		replacement?: OrderedLearningRecordInput["parsedItem"],
	): Promise<void> {
		const record = this.records.get(cellId);
		if (!record) return;
		const now = new Date().toISOString();
		record.history = {
			...(record.history || {}),
			priorCorrectionCount: (record.history?.priorCorrectionCount || 0) + 1,
			lastCorrectedAt: now,
			recencyScore: scoreRecency(now),
		};
		record.flags = {
			...(record.flags || {}),
			stalePreference: true,
			reviewRequired: !!replacement,
		};
		if (replacement) {
			record.parsedItem = replacement;
		}
	}
}
