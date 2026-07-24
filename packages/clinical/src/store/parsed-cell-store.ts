import type {
	ParsedItem,
	ParsedObservationItem,
} from "../parser/schema-parsers";

export type ParsedCellSourceKind = "direct_contract" | "fallback" | "heuristic";
export type ParsedCellOutcome = "accepted" | "rejected" | "corrected";

export interface ParsedCellV1Shared {
	cellId: string;
	sessionId?: string;
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

export interface ParsedCellCandidateTokenV1 {
	text: string;
	start: number;
	end: number;
	kind?: string;
	sourceRule?: string;
}

export interface ParsedCellV1ObservedShape {
	schema: string;
	slots: Record<string, any>;
}

export interface ParsedCellObservationDetailV1 {
	cellId: string;
	conceptId?: string;
	display: string;
	certainty?: string;
	status?: string;
	severity?: string;
	candidateTokens: ParsedCellCandidateTokenV1[];
	contextTokens?: string[];
	shape: ParsedCellV1ObservedShape;
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

export interface ParsedCellV1<TParsedItem extends ParsedItem = ParsedItem> {
	shared: ParsedCellV1Shared;
	parsedItem: TParsedItem;
}

export interface ParsedCellJoinResult<
	TParsedItem extends ParsedItem = ParsedItem,
> {
	shared: ParsedCellV1Shared;
	detail: ParsedCellObservationDetailV1 | null;
	parsedItem: TParsedItem | null;
}

export interface ParsedCellHistoryStore {
	getObservationHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellObservationDetailV1[]>;
	putObservation(record: ParsedCellV1<ParsedObservationItem>): Promise<void>;
	markObservationCorrection(
		cellId: string,
		replacement?: ParsedObservationItem,
	): Promise<void>;
}

export interface ParsedCellHistoryAdapter {
	adapterId: string;
	weight: number;
	store: ParsedCellHistoryStore;
}

export interface ParsedCellWeightedHistoryCandidate {
	candidate: ParsedCellObservationDetailV1;
	adapterId: string;
	weight: number;
}

export interface ParsedCellWeightedHistoryStore {
	getWeightedObservationHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellWeightedHistoryCandidate[]>;
}

export class CompositeParsedCellHistoryStore
	implements ParsedCellHistoryStore, ParsedCellWeightedHistoryStore
{
	constructor(private adapters: ParsedCellHistoryAdapter[]) {}

	async getWeightedObservationHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellWeightedHistoryCandidate[]> {
		const results = await Promise.all(
			this.adapters.map(async (adapter) => {
				const rows = await adapter.store.getObservationHistory(key);
				return rows.map((candidate) => ({
					candidate,
					adapterId: adapter.adapterId,
					weight: adapter.weight,
				}));
			}),
		);
		return results.flat();
	}

	async getObservationHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellObservationDetailV1[]> {
		return (await this.getWeightedObservationHistory(key)).map(
			(entry) => entry.candidate,
		);
	}

	async putObservation(
		record: ParsedCellV1<ParsedObservationItem>,
	): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) => adapter.store.putObservation(record)),
		);
	}

	async markObservationCorrection(
		cellId: string,
		replacement?: ParsedObservationItem,
	): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) =>
				adapter.store.markObservationCorrection(cellId, replacement),
			),
		);
	}
}

export interface ParsedCellHistoryKey {
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

export function buildObservationShape(
	item: ParsedObservationItem,
): ParsedCellV1ObservedShape {
	return {
		schema: item.targetSchema,
		slots: {
			conceptId: item.conceptId,
			severity: item.severity,
			certainty: item.certainty,
			status: item.status,
		},
	};
}

export function scoreRecency(lastAt?: string, now = Date.now()): number {
	if (!lastAt) return 0;
	const elapsedDays = Math.max(0, (now - Date.parse(lastAt)) / 86_400_000);
	return 1 / (1 + elapsedDays);
}

export interface ParsedCellStore {
	putObservation(record: ParsedCellV1<ParsedObservationItem>): Promise<void>;
	get(cellId: string): Promise<ParsedCellJoinResult | null>;
	listBySession(sessionId: string): Promise<ParsedCellJoinResult[]>;
	listObservationPilots(
		sessionId?: string,
	): Promise<ParsedCellJoinResult<ParsedObservationItem>[]>;
}

export class MemoryParsedCellStore implements ParsedCellStore {
	private shared = new Map<string, ParsedCellV1Shared>();
	private observationDetails = new Map<string, ParsedCellObservationDetailV1>();

	async putObservation(
		record: ParsedCellV1<ParsedObservationItem>,
	): Promise<void> {
		const existing = this.observationDetails.get(record.shared.cellId);
		this.shared.set(record.shared.cellId, record.shared);
		this.observationDetails.set(record.shared.cellId, {
			cellId: record.shared.cellId,
			conceptId: record.parsedItem.conceptId,
			display: record.parsedItem.display,
			certainty: record.parsedItem.certainty,
			status: record.parsedItem.status,
			severity: record.parsedItem.severity,
			candidateTokens: [],
			shape: buildObservationShape(record.parsedItem),
			parsedItem: record.parsedItem,
			history: {
				priorAcceptCount: (existing?.history?.priorAcceptCount || 0) + 1,
				priorCorrectionCount: existing?.history?.priorCorrectionCount || 0,
				lastAcceptedAt: record.shared.acceptedAt,
				lastCorrectedAt: existing?.history?.lastCorrectedAt,
				recencyScore: scoreRecency(record.shared.acceptedAt),
			},
			flags: {
				contractValid: true,
				stalePreference: !!existing?.history?.priorCorrectionCount,
				reviewRequired: false,
			},
		});
	}

	async markObservationCorrection(
		cellId: string,
		replacement?: ParsedObservationItem,
	): Promise<void> {
		const detail = this.observationDetails.get(cellId);
		if (!detail) return;
		const now = new Date().toISOString();
		detail.history = {
			...(detail.history || {}),
			priorCorrectionCount: (detail.history?.priorCorrectionCount || 0) + 1,
			lastCorrectedAt: now,
			recencyScore: scoreRecency(now),
		};
		detail.flags = {
			...(detail.flags || {}),
			stalePreference: true,
			reviewRequired: !!replacement,
		};
		if (replacement) {
			detail.parsedItem = replacement;
			detail.conceptId = replacement.conceptId;
			detail.display = replacement.display;
			detail.certainty = replacement.certainty;
			detail.status = replacement.status;
			detail.severity = replacement.severity;
			detail.shape = buildObservationShape(replacement);
		}
	}

	async get(cellId: string): Promise<ParsedCellJoinResult | null> {
		const shared = this.shared.get(cellId);
		if (!shared) return null;
		return {
			shared,
			detail: this.observationDetails.get(cellId) || null,
			parsedItem: this.observationDetails.get(cellId)?.parsedItem || null,
		};
	}

	async listBySession(sessionId: string): Promise<ParsedCellJoinResult[]> {
		return Array.from(this.shared.values())
			.filter((row) => row.sessionId === sessionId)
			.map((shared) => ({
				shared,
				detail: this.observationDetails.get(shared.cellId) || null,
				parsedItem:
					this.observationDetails.get(shared.cellId)?.parsedItem || null,
			}));
	}

	async listObservationPilots(
		sessionId?: string,
	): Promise<ParsedCellJoinResult<ParsedObservationItem>[]> {
		const rows = Array.from(this.shared.values()).filter((row) => {
			if (row.targetSchema !== "ObservationEvent") return false;
			if (sessionId && row.sessionId !== sessionId) return false;
			return true;
		});
		return rows.map((shared) => ({
			shared,
			detail: this.observationDetails.get(shared.cellId) || null,
			parsedItem:
				this.observationDetails.get(shared.cellId)?.parsedItem || null,
		}));
	}

	async getObservationHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellObservationDetailV1[]> {
		return Array.from(this.shared.values())
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
				if (row.rawText !== key.rawText && row.normalizedText !== key.rawText) {
					return false;
				}
				return true;
			})
			.map((row) => this.observationDetails.get(row.cellId))
			.filter(
				(detail): detail is ParsedCellObservationDetailV1 =>
					detail !== undefined,
			);
	}
}
