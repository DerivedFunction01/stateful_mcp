import type { ParsedObservationItem } from "../parser/schema-parsers";
import { JsonlEntityStore } from "@stateful-mcp/core";
import type {
	ParsedCellHistoryKey,
	ParsedCellJoinResult,
	ParsedCellObservationDetailV1,
	ParsedCellStore,
	ParsedCellV1,
	ParsedCellV1Shared,
	ParsedCellWeightedHistoryCandidate,
} from "./parsed-cell-store";
import { buildObservationShape, scoreRecency } from "./parsed-cell-store";

export class JsonlParsedCellStore implements ParsedCellStore {
	private sharedStore: JsonlEntityStore<ParsedCellV1Shared>;
	private detailStore: JsonlEntityStore<ParsedCellObservationDetailV1>;

	constructor(basePath: string) {
		this.sharedStore = new JsonlEntityStore<ParsedCellV1Shared>(
			`${basePath}.shared.jsonl`,
		);
		this.detailStore = new JsonlEntityStore<ParsedCellObservationDetailV1>(
			`${basePath}.detail.jsonl`,
		);
	}

	async putObservation(
		record: ParsedCellV1<ParsedObservationItem>,
	): Promise<void> {
		await this.sharedStore.set(record.shared.cellId, record.shared);
		await this.detailStore.set(record.shared.cellId, {
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
				priorAcceptCount: 1,
				priorCorrectionCount: 0,
				lastAcceptedAt: record.shared.acceptedAt,
				recencyScore: scoreRecency(record.shared.acceptedAt),
			},
			flags: {
				contractValid: true,
				stalePreference: false,
				reviewRequired: false,
			},
		});
	}

	async get(cellId: string): Promise<ParsedCellJoinResult | null> {
		const shared = await this.sharedStore.get(cellId);
		if (!shared) return null;
		const detail = await this.detailStore.get(cellId);
		return { shared, detail, parsedItem: detail?.parsedItem || null };
	}

	async listBySession(sessionId: string): Promise<ParsedCellJoinResult[]> {
		const sharedRows = await this.sharedStore.list();
		const results: ParsedCellJoinResult[] = [];
		for (const shared of sharedRows) {
			if (shared.sessionId !== sessionId) continue;
			const detail = await this.detailStore.get(shared.cellId);
			results.push({ shared, detail, parsedItem: detail?.parsedItem || null });
		}
		return results;
	}

	async listObservationPilots(
		sessionId?: string,
	): Promise<ParsedCellJoinResult<ParsedObservationItem>[]> {
		const sharedRows = await this.sharedStore.list();
		const rows = sharedRows.filter((row) => {
			if (row.targetSchema !== "ObservationEvent") return false;
			if (sessionId && row.sessionId !== sessionId) return false;
			return true;
		});
		const results: ParsedCellJoinResult<ParsedObservationItem>[] = [];
		for (const shared of rows) {
			const detail = await this.detailStore.get(shared.cellId);
			results.push({ shared, detail, parsedItem: detail?.parsedItem || null });
		}
		return results;
	}

	async getObservationHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellObservationDetailV1[]> {
		const sharedRows = await this.sharedStore.list();
		const results: ParsedCellObservationDetailV1[] = [];
		for (const shared of sharedRows) {
			if (shared.targetSchema !== key.targetSchema) continue;
			if (shared.tag !== key.tag) continue;
			if (key.patientId && shared.patientId !== key.patientId) continue;
			if (
				key.patientOrganismType &&
				shared.patientOrganismType !== key.patientOrganismType
			)
				continue;
			if (key.patientGender && shared.patientGender !== key.patientGender)
				continue;
			if (
				key.patientAgeBucket &&
				shared.patientAgeBucket !== key.patientAgeBucket
			)
				continue;
			if (
				key.patientSpeciesBucket &&
				shared.patientSpeciesBucket !== key.patientSpeciesBucket
			)
				continue;
			if (
				key.patientSubBucket !== undefined &&
				shared.patientSubBucket !== key.patientSubBucket
			)
				continue;
			if (
				key.patientBucketKey &&
				shared.patientBucketKey !== key.patientBucketKey
			)
				continue;
			if (key.personnelId && shared.personnelId !== key.personnelId) continue;
			if (key.specialtyId && shared.specialtyId !== key.specialtyId) continue;
			if (key.facilityId && shared.facilityId !== key.facilityId) continue;
			if (shared.rawText !== key.rawText && shared.normalizedText !== key.rawText)
				continue;
			const detail = await this.detailStore.get(shared.cellId);
			if (detail) results.push(detail);
		}
		return results;
	}
}
