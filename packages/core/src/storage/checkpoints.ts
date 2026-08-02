import type { SyncCheckpointRecord, SyncCheckpointStore } from "./contracts";

export class InMemorySyncCheckpointStore implements SyncCheckpointStore {
	private values = new Map<string, SyncCheckpointRecord>();

	async get(
		projectionId: string,
		sourceId: string,
		domain: string,
	): Promise<SyncCheckpointRecord | null> {
		return this.values.get(key(projectionId, sourceId, domain)) ?? null;
	}

	async set(checkpoint: SyncCheckpointRecord): Promise<void> {
		this.values.set(
			key(checkpoint.projectionId, checkpoint.sourceId, checkpoint.domain),
			checkpoint,
		);
	}
}

function key(projectionId: string, sourceId: string, domain: string): string {
	return `${projectionId}:${sourceId}:${domain}`;
}
