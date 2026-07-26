import type { ParsedCellDetail, ParsedCellHistoryKey } from "../interfaces";

// ── Generic History Store ─────────────────────────────────────────────────────

export interface ParsedCellHistoryStore<TDetail extends ParsedCellDetail> {
	getHistory(key: ParsedCellHistoryKey): Promise<TDetail[]>;
	putRecord(record: any): Promise<void>;
	markCorrection(cellId: string, replacement?: any): Promise<void>;
}

export interface ParsedCellHistoryAdapter<TDetail extends ParsedCellDetail> {
	adapterId: string;
	weight: number;
	store: ParsedCellHistoryStore<TDetail>;
}

export interface ParsedCellWeightedHistoryCandidate<
	TDetail extends ParsedCellDetail,
> {
	candidate: TDetail;
	adapterId: string;
	weight: number;
}

export interface ParsedCellWeightedHistoryStore<
	TDetail extends ParsedCellDetail,
> {
	getWeightedHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellWeightedHistoryCandidate<TDetail>[]>;
}

export class CompositeParsedCellHistoryStore<TDetail extends ParsedCellDetail>
	implements
		ParsedCellHistoryStore<TDetail>,
		ParsedCellWeightedHistoryStore<TDetail>
{
	constructor(private adapters: ParsedCellHistoryAdapter<TDetail>[]) {}

	async getWeightedHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellWeightedHistoryCandidate<TDetail>[]> {
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

	async getHistory(key: ParsedCellHistoryKey): Promise<TDetail[]> {
		return (await this.getWeightedHistory(key)).map((entry) => entry.candidate);
	}

	async putRecord(record: any): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) => adapter.store.putRecord(record)),
		);
	}

	async markCorrection(cellId: string, replacement?: any): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) =>
				adapter.store.markCorrection(cellId, replacement),
			),
		);
	}
}
