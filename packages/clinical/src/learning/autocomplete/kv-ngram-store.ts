import type { KvBackend } from "@stateful-mcp/core";
import type { AutocompleteSuggestionKind } from "../../stores/auto-complete/interfaces";
import type { NgramRecord, NgramStore, NgramSuggestion } from "../interfaces";

const STORE_PREFIX = "ngram:";

export class KvNgramStore implements NgramStore {
	constructor(private backend: KvBackend) {}

	private buildKey(ngram: string, n: number, kind: string): string {
		return `${STORE_PREFIX}${kind}:${n}:${ngram.toLowerCase()}`;
	}

	async increment(
		ngram: string,
		n: 1 | 2 | 3,
		kind: AutocompleteSuggestionKind,
		ctx?: { templateId?: string; slotName?: string },
	): Promise<void> {
		const key = this.buildKey(ngram, n, kind);
		const data = await this.backend.load();
		const existing = data[key] as NgramRecord | undefined;
		const now = new Date().toISOString();

		if (existing) {
			existing.frequency += 1;
			existing.lastUpdatedAt = now;
			if (ctx?.templateId) existing.templateId = ctx.templateId;
			if (ctx?.slotName) existing.slotName = ctx.slotName;
			await this.backend.set(key, existing);
		} else {
			const record: NgramRecord = {
				ngram: ngram.toLowerCase(),
				n,
				kind,
				frequency: 1,
				lastUpdatedAt: now,
				templateId: ctx?.templateId,
				slotName: ctx?.slotName,
			};
			await this.backend.set(key, record);
		}

		await this.backend.save();
	}

	async suggest(prefix: string, limit = 10): Promise<NgramSuggestion[]> {
		const data = await this.backend.load();
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
		const data = await this.backend.load();
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
