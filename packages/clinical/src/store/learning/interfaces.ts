import type { ParsedObservationItem } from "../../parser/schema-parsers";

// ── Base ──────────────────────────────────────────────────────────────────────

export interface ParsedItem {
	targetSchema: string;
}

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

export interface ParsedCellObservedShape {
	schema: string;
	slots: Record<string, any>;
}

// ── Schema-Specific Detail Types ──────────────────────────────────────────────

export interface ParsedCellObservationDetail {
	cellId: string;
	soapNoteId?: string;
	conceptId?: string;
	display: string;
	certainty?: string;
	status?: string;
	severity?: string;
	candidateTokens: ParsedCellCandidateToken[];
	contextTokens?: string[];
	shape: ParsedCellObservedShape;
	parsedItem: ParsedObservationItem;
	provenance?: {
		parserPath?: string;
		matchedRegexes?: string[];
		conceptHit?: string;
	};
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

export interface ParsedCellVitalsDetail {
	cellId: string;
	shape: any;
	history: any;
	flags: any;
	parsedItem: any;
}

export interface ParsedCellMedicationDetail {
	cellId: string;
	shape: any;
	history: any;
	flags: any;
	parsedItem: any;
}

// ── Discriminated Union ───────────────────────────────────────────────────────

export type ParsedCellDetail =
	| ({ targetSchema: "ObservationEvent" } & ParsedCellObservationDetail)
	| ({ targetSchema: "VitalsMeasurementEvent" } & ParsedCellVitalsDetail)
	| ({ targetSchema: "MedicationOrderObject" } & ParsedCellMedicationDetail);

// ── Generic Wrappers ──────────────────────────────────────────────────────────

export interface ParsedCellRecord<TParsedItem extends ParsedItem = ParsedItem> {
	shared: ParsedCellShared;
	detail: ParsedCellDetail;
	parsedItem: TParsedItem;
}

export interface ParsedCellLookup<TParsedItem extends ParsedItem = ParsedItem> {
	shared: ParsedCellShared;
	detail: ParsedCellDetail | null;
	parsedItem: TParsedItem | null;
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
	putRecord(record: ParsedCellRecord<ParsedItem>): Promise<void>;
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

	getHistoryBySchema<TDetail extends ParsedCellDetail>(
		targetSchema: TDetail["targetSchema"],
		key: ParsedCellHistoryKey,
	): Promise<TDetail[]>;
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
