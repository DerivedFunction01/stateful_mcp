import type {
	ParsedCellHistoryKey,
	ParsedCellObservationDetail,
	ParsedCellObservedShape,
} from "../interfaces";

// ── History Store (Observation-specific) ──────────────────────────────────────

export interface ParsedCellHistoryStore {
	getObservationHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellObservationDetail[]>;
	putObservation(record: any): Promise<void>;
	markObservationCorrection(cellId: string, replacement?: any): Promise<void>;
}

export interface ParsedCellHistoryAdapter {
	adapterId: string;
	weight: number;
	store: ParsedCellHistoryStore;
}

export interface ParsedCellWeightedHistoryCandidate {
	candidate: ParsedCellObservationDetail;
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
	): Promise<ParsedCellObservationDetail[]> {
		return (await this.getWeightedObservationHistory(key)).map(
			(entry) => entry.candidate,
		);
	}

	async putObservation(record: any): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) => adapter.store.putObservation(record)),
		);
	}

	async markObservationCorrection(
		cellId: string,
		replacement?: any,
	): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) =>
				adapter.store.markObservationCorrection(cellId, replacement),
			),
		);
	}
}

// ── Observation Shape Builder ─────────────────────────────────────────────────

export function buildObservationShape(item: any): ParsedCellObservedShape {
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
