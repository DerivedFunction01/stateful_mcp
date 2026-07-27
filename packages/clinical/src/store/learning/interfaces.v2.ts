import type { ParsedItem } from "../../parser/schema-parsers.v2";

// ── Base ──────────────────────────────────────────────────────────────────────

export type ParsedCellSourceKind = "direct_contract" | "fallback" | "heuristic";
export type ParsedCellOutcome = "accepted" | "rejected" | "corrected";

// ── Shared Record Fields ──────────────────────────────────────────────────────

export interface ParsedCellShared {
	cellId: string;
	sessionId?: string;
	soapNoteId?: string;
	patientId?: string;
	patientOrganismType?: string;
	patientGender?: string;
	patientAgeBucket?: string;
	patientSpeciesBucket?: string;
	patientSubBucket?: number;
	patientBucketKey?: string;
	patientTierWeights?: {
		exact: number;
		biology: number;
		specific: number;
		global: number;
	};
	personnelId?: string;
	specialtyId?: string;
	facilityId?: string;
	workspaceId?: string;
	tag: string;
	targetSchema: string;
	rawText: string;
	normalizedText?: string;
	anchorText: string;
	parserVersion: string;
	contractVersion: string;
	sourceKind: ParsedCellSourceKind;
	outcome: ParsedCellOutcome;
	replacedByCellId?: string;
	acceptedAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface ParsedCellCandidateToken {
	text: string;
	start: number;
	end: number;
	kind?: string;
	sourceRule?: string;
}

export interface ParsedCellHistory {
	priorAcceptCount?: number;
	priorCorrectionCount?: number;
	lastAcceptedAt?: string;
	lastCorrectedAt?: string;
	recencyScore?: number;
}

export interface ParsedCellFlags {
	contractValid?: boolean;
	stalePreference?: boolean;
	reviewRequired?: boolean;
}

export interface ParsedCellProvenance {
	parserPath?: string;
	matchedRegexes?: string[];
	conceptHit?: string;
}

// ── Unified Record Types ──────────────────────────────────────────────────────

export interface ParsedCellRecord {
	shared: ParsedCellShared;
	parsedItem: ParsedItem;
	learningMetadata: {
		history: ParsedCellHistory;
		flags: ParsedCellFlags;
		provenance?: ParsedCellProvenance;
		candidateTokens?: ParsedCellCandidateToken[];
		contextTokens?: string[];
	};
}

export interface ParsedCellLookup {
	shared: ParsedCellShared;
	parsedItem: ParsedItem | null;
	learningMetadata: {
		history: ParsedCellHistory;
		flags: ParsedCellFlags;
		provenance?: ParsedCellProvenance;
		candidateTokens?: ParsedCellCandidateToken[];
		contextTokens?: string[];
	};
}

// ── History Query Key ─────────────────────────────────────────────────────────

export interface ParsedCellHistoryKey {
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
	normalizedText?: string;
}

// ── ParsedCellStore ───────────────────────────────────────────────────────────

export interface ParsedCellStore {
	putRecord(record: ParsedCellRecord): Promise<void>;
	get(cellId: string): Promise<ParsedCellLookup | null>;
	listBySession(
		sessionId: string,
		targetSchema?: string,
	): Promise<ParsedCellLookup[]>;
	listByTargetSchema(
		targetSchema: string,
		sessionId?: string,
	): Promise<ParsedCellLookup[]>;
	markCorrection(cellId: string, replacement?: ParsedItem): Promise<void>;

	getHistoryBySchema(
		targetSchema: string,
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellRecord[]>;
}

// ── Generic Helpers ─────────────────────────────────────────────────────────────

export function scoreRecency(lastAt?: string, now = Date.now()): number {
	if (!lastAt) return 0;
	const elapsedDays = Math.max(0, (now - Date.parse(lastAt)) / 86_400_000);
	return 1 / (1 + elapsedDays);
}

// ── Ordered Learning Types ────────────────────────────────────────────────────

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
	parsedItem: ParsedItem;
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
	parsedItem: ParsedItem;
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

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_ORDERED_TOKENS = 512;
export const ADJACENT_GAP_THRESHOLD = 1;
export const NEAR_GAP_THRESHOLD = 5;

// ── Store Interface ───────────────────────────────────────────────────────────

export interface OrderedLearningStore {
	getHistory(key: OrderedLearningHistoryKey): Promise<OrderedLearningRecord[]>;
	putRecord(record: OrderedLearningRecordInput): Promise<void>;
	markCorrection(
		cellId: string,
		replacement?: OrderedLearningRecordInput["parsedItem"],
	): Promise<void>;
}

// ── Adapter / Weighted Composite Interfaces ───────────────────────────────────

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
	getWeightedOrderedHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningWeightedCandidate[]>;
}

// ── History Store (v2) ────────────────────────────────────────────────────────

export interface ParsedCellHistoryStore {
	getHistory(key: ParsedCellHistoryKey): Promise<ParsedCellRecord[]>;
	putRecord(record: ParsedCellRecord): Promise<void>;
	markCorrection(cellId: string, replacement?: ParsedItem): Promise<void>;
}

// ── Ranker Types (v2) ───────────────────────────────────────────────────────────

export interface ParsedCellRankerContext {
	tag: string;
	targetSchema: string;
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
	rawText: string;
	history: ParsedCellRecord[];
}

export interface ParsedCellRankerScore {
	score: number;
	reason?: string;
}

export type ParsedCellPreferenceMode = "deterministic" | "learned" | "dual";

export interface ParsedCellPreferenceProjection<TCandidate = ParsedCellRecord> {
	mode: ParsedCellPreferenceMode;
	deterministic: TCandidate | null;
	learned: TCandidate | null;
	winner: TCandidate | null;
	deterministicScore?: ParsedCellRankerScore;
	learnedScore?: ParsedCellRankerScore;
}

export interface ParsedCellPreferenceCandidate<TCandidate = ParsedCellRecord> {
	candidate: TCandidate;
	score: ParsedCellRankerScore;
	source: "deterministic" | "learned";
}

export interface ParsedCellPreferenceRanking<TCandidate = ParsedCellRecord> {
	mode: ParsedCellPreferenceMode;
	candidates: ParsedCellPreferenceCandidate<TCandidate>[];
	winner: TCandidate | null;
}

export interface ParsedCellPreview<TCandidate = ParsedCellRecord> {
	deterministic: TCandidate[];
	learned: TCandidate[];
	ranking: ParsedCellPreferenceRanking<TCandidate>;
}

export interface ParsedCellRanker<TCandidate = ParsedCellRecord> {
	score(
		candidate: TCandidate,
		context: ParsedCellRankerContext,
	): ParsedCellRankerScore;
	choose(
		deterministic: TCandidate | null,
		learned: TCandidate | null,
		context: ParsedCellRankerContext,
		mode?: ParsedCellPreferenceMode,
	): ParsedCellPreferenceProjection<TCandidate>;
	rankMany(
		candidates: Array<{
			candidate: TCandidate;
			source: "deterministic" | "learned";
		}>,
		context: ParsedCellRankerContext,
		mode?: ParsedCellPreferenceMode,
	): ParsedCellPreferenceRanking<TCandidate>;
	previewMany(
		candidates: Array<{
			candidate: TCandidate;
			source: "deterministic" | "learned";
		}>,
		context: ParsedCellRankerContext,
		mode?: ParsedCellPreferenceMode,
	): ParsedCellPreview<TCandidate>;
}
