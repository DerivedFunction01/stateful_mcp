import type {
	OrderedLearningHistoryKey,
	OrderedLearningRecord,
	OrderedLearningRecordInput,
	OrderedLearningStore,
	OrderedLearningStoreAdapter,
	OrderedLearningWeightedCandidate,
	OrderedLearningWeightedStore,
} from "../interfaces";

export class CompositeOrderedLearningStore
	implements OrderedLearningStore, OrderedLearningWeightedStore
{
	constructor(private adapters: OrderedLearningStoreAdapter[]) {}

	async getWeightedOrderedHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningWeightedCandidate[]> {
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

	async getHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningRecord[]> {
		return (await this.getWeightedOrderedHistory(key)).map(
			(entry) => entry.candidate,
		);
	}

	async putRecord(record: OrderedLearningRecordInput): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) => adapter.store.putRecord(record)),
		);
	}

	async markCorrection(
		cellId: string,
		replacement?: OrderedLearningRecordInput["parsedItem"],
	): Promise<void> {
		await Promise.all(
			this.adapters.map((adapter) =>
				adapter.store.markCorrection(cellId, replacement),
			),
		);
	}
}
