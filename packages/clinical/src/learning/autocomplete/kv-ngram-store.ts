import type { KvBackend } from "@stateful-mcp/core";
import type { AutocompleteSuggestionKind } from "../../stores/auto-complete/interfaces";
import type { NgramRecord, NgramStore, NgramSuggestion } from "../interfaces";

const STORE_PREFIX = "ngram:";
const CHECKPOINT_INTERVAL = 256;

export class KvNgramStore implements NgramStore {
	private data: Record<string, unknown> | null = null;
	private writeTail: Promise<void> = Promise.resolve();
	private writesSinceCheckpoint = 0;

	constructor(private backend: KvBackend) {}

	private async ensureLoaded(): Promise<Record<string, unknown>> {
		if (this.data === null) this.data = await this.backend.load();
		return this.data;
	}

	/** Refresh the cache when another store instance may have changed the backend. */
	async reload(): Promise<void> {
		this.data = await this.backend.load();
	}

	private enqueueWrite(operation: () => Promise<void>): Promise<void> {
		const next = this.writeTail.then(operation, operation);
		this.writeTail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}

	private async checkpointIfNeeded(): Promise<void> {
		this.writesSinceCheckpoint += 1;
		if (this.writesSinceCheckpoint < CHECKPOINT_INTERVAL) return;
		await this.backend.save();
		this.writesSinceCheckpoint = 0;
	}

	private buildKey(ngram: string, n: number, kind: string): string {
		return `${STORE_PREFIX}${kind}:${n}:${ngram.toLowerCase()}`;
	}

	async increment(
		ngram: string,
		n: 1 | 2 | 3,
		kind: AutocompleteSuggestionKind,
		ctx?: { templateId?: string; slotName?: string },
	): Promise<void> {
		await this.enqueueWrite(async () => {
			const key = this.buildKey(ngram, n, kind);
			const data = await this.ensureLoaded();
			const existing = data[key] as NgramRecord | undefined;
			const now = new Date().toISOString();
			const record: NgramRecord = existing
				? {
						...existing,
						frequency: existing.frequency + 1,
						lastUpdatedAt: now,
					}
				: {
						ngram: ngram.toLowerCase(),
						n,
						kind,
						frequency: 1,
						lastUpdatedAt: now,
						templateId: ctx?.templateId,
						slotName: ctx?.slotName,
					};
			if (ctx?.templateId) record.templateId = ctx.templateId;
			if (ctx?.slotName) record.slotName = ctx.slotName;

			data[key] = record;
			await this.backend.set(key, record);
			await this.checkpointIfNeeded();
		});
	}

	async suggest(prefix: string, limit = 10): Promise<NgramSuggestion[]> {
		const data = await this.ensureLoaded();
		const lower = prefix.toLowerCase();
		const results: NgramSuggestion[] = [];

		for (const value of Object.values(data)) {
			const record = value as NgramRecord;
			if (
				record &&
				typeof record.ngram === "string" &&
				record.ngram.startsWith(lower)
			) {
				results.push({
					ngram: record.ngram,
					n: record.n,
					kind: record.kind,
					frequency: record.frequency,
					lastUpdatedAt: record.lastUpdatedAt,
				});
			}
		}

		results.sort((a, b) => b.frequency - a.frequency);
		return results.slice(0, limit);
	}

	async getTopByKind(
		kind: AutocompleteSuggestionKind,
		limit = 10,
	): Promise<NgramSuggestion[]> {
		const data = await this.ensureLoaded();
		const results: NgramSuggestion[] = [];

		for (const value of Object.values(data)) {
			const record = value as NgramRecord;
			if (record && record.kind === kind) {
				results.push({
					ngram: record.ngram,
					n: record.n,
					kind: record.kind,
					frequency: record.frequency,
					lastUpdatedAt: record.lastUpdatedAt,
				});
			}
		}

		results.sort((a, b) => b.frequency - a.frequency);
		return results.slice(0, limit);
	}
}
