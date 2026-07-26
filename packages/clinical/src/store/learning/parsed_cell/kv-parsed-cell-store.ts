import type { KvBackend } from "@stateful-mcp/core";
import type {
	ParsedCellDetail,
	ParsedCellHistoryKey,
	ParsedCellLookup,
	ParsedCellRecord,
	ParsedCellStore,
	ParsedItem,
} from "../interfaces";
import { scoreRecency } from "../interfaces";

// ── KvBackend-based ParsedCellStore ───────────────────────────────────────────

export class KvParsedCellStore implements ParsedCellStore {
	constructor(private backend: KvBackend) {}

	async putRecord(record: ParsedCellRecord<ParsedItem>): Promise<void> {
		const id = record.shared.cellId;
		await this.backend.set(`shared:${id}`, record.shared);
		await this.backend.set(`detail:${id}`, record.detail);
		await this.backend.save();
	}

	async get(cellId: string): Promise<ParsedCellLookup | null> {
		const data = await this.backend.load();
		const shared = data[`shared:${cellId}`];
		const detail = data[`detail:${cellId}`];

		if (!shared) return null;
		return {
			shared: shared as any,
			detail: (detail as any) || null,
			parsedItem: null,
		};
	}

	async listBySession(
		sessionId: string,
		targetSchema?: string,
	): Promise<ParsedCellLookup[]> {
		const data = await this.backend.load();
		const results: ParsedCellLookup[] = [];

		for (const [key, val] of Object.entries(data)) {
			if (key.startsWith("shared:")) {
				const shared = val as any;
				if (
					shared.sessionId === sessionId &&
					(!targetSchema || shared.targetSchema === targetSchema)
				) {
					const detail = data[`detail:${shared.cellId}`] as any;
					results.push({ shared, detail, parsedItem: null });
				}
			}
		}
		return results;
	}

	async listByTargetSchema(
		targetSchema: string,
		sessionId?: string,
	): Promise<ParsedCellLookup[]> {
		const data = await this.backend.load();
		const results: ParsedCellLookup[] = [];

		for (const [key, val] of Object.entries(data)) {
			if (key.startsWith("shared:")) {
				const shared = val as any;
				if (
					shared.targetSchema === targetSchema &&
					(!sessionId || shared.sessionId === sessionId)
				) {
					const detail = data[`detail:${shared.cellId}`] as any;
					results.push({ shared, detail, parsedItem: null });
				}
			}
		}
		return results;
	}

	async markCorrection(
		cellId: string,
		replacement?: ParsedItem,
	): Promise<void> {
		const data = await this.backend.load();
		const detail = data[`detail:${cellId}`] as any;
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
		}

		await this.backend.set(`detail:${cellId}`, detail);
		await this.backend.save();
	}

	async getHistoryBySchema<TDetail extends ParsedCellDetail>(
		targetSchema: TDetail["targetSchema"],
		key: ParsedCellHistoryKey,
	): Promise<TDetail[]> {
		const data = await this.backend.load();
		const matches: TDetail[] = [];

		for (const [k, val] of Object.entries(data)) {
			if (k.startsWith("shared:")) {
				const shared = val as any;

				if (shared.targetSchema !== targetSchema) continue;
				if (shared.tag !== key.tag) continue;

				// Define all exact-match keys to check in a loop
				const exactMatchKeys = [
					"patientId",
					"patientOrganismType",
					"patientGender",
					"patientAgeBucket",
					"patientSpeciesBucket",
					"patientSubBucket",
					"patientBucketKey",
					"personnelId",
					"specialtyId",
					"facilityId",
				] as const;

				// If any key exists on `key` and doesn't match `shared`, skip
				const hasMismatch = exactMatchKeys.some(
					(kName) => key[kName] !== undefined && shared[kName] !== key[kName],
				);
				if (hasMismatch) continue;

				// Special condition for text matching
				if (
					shared.rawText !== key.rawText &&
					shared.normalizedText !== key.rawText
				) {
					continue;
				}

				const detail = data[`detail:${shared.cellId}`] as TDetail | undefined;
				if (detail) matches.push(detail);
			}
		}

		return matches.sort(
			(a, b) => (b.history?.recencyScore || 0) - (a.history?.recencyScore || 0),
		);
	}
}
