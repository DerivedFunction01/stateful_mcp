import type {
	ParsedCellHistoryKey,
	ParsedCellHistoryStore,
	ParsedCellRecord,
} from "../interfaces";

export type { ParsedCellHistoryStore } from "../interfaces";

export interface ParsedCellWeightedHistoryCandidate {
	candidate: ParsedCellRecord;
	adapterId: string;
	weight: number;
}

export interface ParsedCellWeightedHistoryStore {
	getWeightedHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellWeightedHistoryCandidate[]>;
}

export interface ParsedCellHistoryAdapter {
	adapterId: string;
	weight: number;
	store: ParsedCellHistoryStore;
}

export class CompositeParsedCellHistoryStore
	implements ParsedCellHistoryStore, ParsedCellWeightedHistoryStore
{
	constructor(private adapters: ParsedCellHistoryAdapter[]) {}

	async getWeightedHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellWeightedHistoryCandidate[]> {
		const results = await Promise.all(
			this.adapters.map(async (adapter) => {
				const rows = await adapter.store.getHistory(key);
				return rows.map((candidate) => ({
					candidate,
					adapterId: adapter.adapterId,
					weight: adapter.weight,
				}));
			}),
		);
		return results.flat();
	}

	async getHistory(key: ParsedCellHistoryKey): Promise<ParsedCellRecord[]> {
		return (await this.getWeightedHistory(key)).map((entry) => entry.candidate);
	}

	async putRecord(record: ParsedCellRecord): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) => adapter.store.putRecord(record)),
		);
	}

	async markCorrection(
		cellId: string,
		replacement?: ParsedCellRecord["parsedItem"],
	): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) =>
				adapter.store.markCorrection(cellId, replacement),
			),
		);
	}
}
