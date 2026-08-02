import type {
	CursorSyncSource,
	SyncCheckpointStore,
	SyncMedium,
	SyncPreview,
	SyncRecord,
	SyncResult,
	SyncTarget,
} from "./contracts";

export interface SyncCheckpoint {
	sourceId: string;
	domain: string;
	cursor?: string;
	updatedAt: string;
	status: "idle" | "applied" | "error";
	errorMessage?: string;
}

export class InMemorySyncMedium implements SyncMedium {
	private records: SyncRecord[] = [];

	async *read(): AsyncIterable<SyncRecord> {
		for (const record of this.records) yield record;
	}

	async write(records: AsyncIterable<SyncRecord>): Promise<void> {
		for await (const record of records) this.records.push(record);
	}
}

export interface SyncApplyOptions {
	sourceId: string;
	domain: string;
	nextCursor?: string;
}

/** Coordinates batch application and only commits a cursor after apply succeeds. */
export class SyncOrchestrator {
	private checkpoints = new Map<string, SyncCheckpoint>();

	constructor(private target: SyncTarget) {}

	async preview(records: AsyncIterable<SyncRecord>): Promise<SyncPreview> {
		return this.target.preview(records);
	}

	async apply(
		records: AsyncIterable<SyncRecord>,
		options: SyncApplyOptions,
	): Promise<SyncResult> {
		const batch = await collectRecords(records);
		const key = checkpointKey(options.sourceId, options.domain);
		try {
			const result = await this.target.apply(arrayRecords(batch));
			this.checkpoints.set(key, {
				sourceId: options.sourceId,
				domain: options.domain,
				cursor: options.nextCursor,
				updatedAt: new Date().toISOString(),
				status: "applied",
			});
			return result;
		} catch (error) {
			this.checkpoints.set(key, {
				sourceId: options.sourceId,
				domain: options.domain,
				updatedAt: new Date().toISOString(),
				status: "error",
				errorMessage: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	getCheckpoint(sourceId: string, domain: string): SyncCheckpoint | null {
		return this.checkpoints.get(checkpointKey(sourceId, domain)) ?? null;
	}
}

export interface IncrementalSyncOptions {
	projectionId: string;
	sourceId: string;
	domain: string;
	pageSize?: number;
	maxRetries?: number;
}

export interface IncrementalSyncResult extends SyncResult {
	nextCursor?: string;
	hasMore?: boolean;
	attempts: number;
}

export class IncrementalSyncRunner {
	constructor(
		private source: CursorSyncSource,
		private target: SyncTarget,
		private checkpoints: SyncCheckpointStore,
	) {}

	async pull(options: IncrementalSyncOptions): Promise<IncrementalSyncResult> {
		const previous = await this.checkpoints.get(
			options.projectionId,
			options.sourceId,
			options.domain,
		);
		const maxRetries = options.maxRetries ?? 0;
		let attempts = 0;
		let lastError: unknown;

		while (attempts <= maxRetries) {
			attempts++;
			try {
				const page = await this.source.changesPage(
					previous?.cursor,
					options.pageSize,
				);
				const result = await this.target.apply(arrayRecords(page.records));
				await this.checkpoints.set({
					projectionId: options.projectionId,
					sourceId: options.sourceId,
					domain: options.domain,
					cursor: page.nextCursor,
					status: "applied",
					updatedAt: new Date().toISOString(),
				});
				return {
					...result,
					nextCursor: page.nextCursor,
					hasMore: page.hasMore,
					attempts,
				};
			} catch (error) {
				lastError = error;
				await this.checkpoints.set({
					projectionId: options.projectionId,
					sourceId: options.sourceId,
					domain: options.domain,
					cursor: previous?.cursor,
					status: "error",
					updatedAt: new Date().toISOString(),
					errorMessage: error instanceof Error ? error.message : String(error),
				});
			}
		}
		throw lastError;
	}
}

export class InMemorySyncTarget implements SyncTarget {
	private records = new Map<string, SyncRecord>();
	private tombstones = new Map<string, SyncRecord>();

	async preview(records: AsyncIterable<SyncRecord>) {
		const batch = await collectRecords(records);
		let accepted = 0;
		let rejected = 0;
		for (const record of batch) {
			if (this.isStale(record)) rejected++;
			else accepted++;
		}
		return { accepted, rejected };
	}

	async apply(records: AsyncIterable<SyncRecord>): Promise<SyncResult> {
		const batch = await collectRecords(records);
		const nextRecords = new Map(this.records);
		const nextTombstones = new Map(this.tombstones);
		let accepted = 0;
		let rejected = 0;

		for (const record of batch) {
			if (this.isStale(record, nextRecords, nextTombstones)) {
				rejected++;
				continue;
			}
			const key = recordKey(record);
			if (record.operation === "delete" || record.tombstone) {
				nextRecords.delete(key);
				nextTombstones.set(key, record);
			} else {
				nextRecords.set(key, record);
				nextTombstones.delete(key);
			}
			accepted++;
		}

		this.records = nextRecords;
		this.tombstones = nextTombstones;
		return { accepted, rejected };
	}

	get(sourceId: string, domain: string, recordId: string): SyncRecord | null {
		return (
			this.records.get(
				recordKey({ sourceId, domain, recordId } as SyncRecord),
			) ?? null
		);
	}

	getTombstone(
		sourceId: string,
		domain: string,
		recordId: string,
	): SyncRecord | null {
		return (
			this.tombstones.get(
				recordKey({ sourceId, domain, recordId } as SyncRecord),
			) ?? null
		);
	}

	private isStale(
		record: SyncRecord,
		records = this.records,
		tombstones = this.tombstones,
	): boolean {
		const key = recordKey(record);
		const previous = records.get(key) ?? tombstones.get(key);
		return (
			previous !== undefined &&
			compareRevision(record.revision, previous.revision) <= 0
		);
	}
}

async function collectRecords(
	records: AsyncIterable<SyncRecord>,
): Promise<SyncRecord[]> {
	const result: SyncRecord[] = [];
	for await (const record of records) result.push(record);
	return result;
}

async function* arrayRecords(records: SyncRecord[]): AsyncIterable<SyncRecord> {
	for (const record of records) yield record;
}

function checkpointKey(sourceId: string, domain: string): string {
	return `${sourceId}:${domain}`;
}

function recordKey(record: SyncRecord): string {
	return `${record.sourceId}:${record.domain}:${record.recordId}`;
}

function compareRevision(left: string, right: string): number {
	if (left === right) return 0;
	const leftNumber = Number(left);
	const rightNumber = Number(right);
	if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
		return leftNumber < rightNumber ? -1 : 1;
	}
	return left < right ? -1 : 1;
}
