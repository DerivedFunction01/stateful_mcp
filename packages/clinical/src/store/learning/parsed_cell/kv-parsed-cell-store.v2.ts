import type { KvBackend } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../parser/schema-parsers.v2";
import type {
	ParsedCellHistoryKey,
	ParsedCellLookup,
	ParsedCellRecord,
	ParsedCellStore,
} from "../interfaces.v2";
import { scoreRecency } from "../interfaces.v2";
import type { ParsedCellHistoryStore } from "./history-store.v2";

export class KvParsedCellStore
	implements ParsedCellStore, ParsedCellHistoryStore
{
	constructor(private backend: KvBackend) {}

	async putRecord(record: ParsedCellRecord): Promise<void> {
		const id = record.shared.cellId;
		await this.backend.set(`shared:${id}`, record.shared);
		await this.backend.set(`detail:${id}`, {
			parsedItem: record.parsedItem,
			learningMetadata: record.learningMetadata,
		});
		await this.backend.save();
	}

	async get(cellId: string): Promise<ParsedCellLookup | null> {
		const data = await this.backend.load();
		const shared = data[`shared:${cellId}`];
		const detail = data[`detail:${cellId}`] as
			| {
					parsedItem: ParsedItem;
					learningMetadata: ParsedCellRecord["learningMetadata"];
			  }
			| undefined;

		if (!shared) return null;

		const parsedItem = detail?.parsedItem || null;
		const learningMetadata = detail?.learningMetadata || {
			history: {},
			flags: {},
		};

		return {
			shared: shared as ParsedCellRecord["shared"],
			parsedItem,
			learningMetadata,
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
				const shared = val as ParsedCellRecord["shared"];
				if (
					shared.sessionId === sessionId &&
					(!targetSchema || shared.targetSchema === targetSchema)
				) {
					const detail = data[`detail:${shared.cellId}`] as
						| {
								parsedItem: ParsedItem;
								learningMetadata: ParsedCellRecord["learningMetadata"];
						  }
						| undefined;
					const parsedItem = detail?.parsedItem || null;
					const learningMetadata = detail?.learningMetadata || {
						history: {},
						flags: {},
					};
					results.push({ shared, parsedItem, learningMetadata });
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
				const shared = val as ParsedCellRecord["shared"];
				if (
					shared.targetSchema === targetSchema &&
					(!sessionId || shared.sessionId === sessionId)
				) {
					const detail = data[`detail:${shared.cellId}`] as
						| {
								parsedItem: ParsedItem;
								learningMetadata: ParsedCellRecord["learningMetadata"];
						  }
						| undefined;
					const parsedItem = detail?.parsedItem || null;
					const learningMetadata = detail?.learningMetadata || {
						history: {},
						flags: {},
					};
					results.push({ shared, parsedItem, learningMetadata });
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
		const detail = data[`detail:${cellId}`] as
			| {
					parsedItem: ParsedItem;
					learningMetadata: ParsedCellRecord["learningMetadata"];
			  }
			| undefined;
		if (!detail) return;

		const now = new Date().toISOString();
		detail.learningMetadata = {
			...detail.learningMetadata,
			history: {
				...(detail.learningMetadata?.history || {}),
				priorCorrectionCount:
					(detail.learningMetadata?.history?.priorCorrectionCount || 0) + 1,
				lastCorrectedAt: now,
				recencyScore: scoreRecency(now),
			},
			flags: {
				...(detail.learningMetadata?.flags || {}),
				stalePreference: true,
				reviewRequired: !!replacement,
			},
		};
		if (replacement) {
			detail.parsedItem = replacement;
		}

		await this.backend.set(`detail:${cellId}`, detail);
		await this.backend.save();
	}

	async getHistoryBySchema(
		targetSchema: string,
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellRecord[]> {
		const data = await this.backend.load();
		const matches: ParsedCellRecord[] = [];

		for (const [k, val] of Object.entries(data)) {
			if (k.startsWith("shared:")) {
				const shared = val as ParsedCellRecord["shared"];

				if (shared.targetSchema !== targetSchema) continue;
				if (shared.tag !== key.tag) continue;

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

				const hasMismatch = exactMatchKeys.some(
					(kName) => key[kName] !== undefined && shared[kName] !== key[kName],
				);
				if (hasMismatch) continue;

				if (
					shared.rawText !== key.rawText &&
					shared.normalizedText !== key.rawText
				) {
					continue;
				}

				const detail = data[`detail:${shared.cellId}`] as
					| {
							parsedItem: ParsedItem;
							learningMetadata: ParsedCellRecord["learningMetadata"];
					  }
					| undefined;
				if (detail) {
					matches.push({
						shared,
						parsedItem: detail.parsedItem,
						learningMetadata: detail.learningMetadata,
					});
				}
			}
		}

		return matches.sort(
			(a, b) =>
				(b.learningMetadata.history?.recencyScore || 0) -
				(a.learningMetadata.history?.recencyScore || 0),
		);
	}

	async getHistory(key: ParsedCellHistoryKey): Promise<ParsedCellRecord[]> {
		return this.getHistoryBySchema(key.targetSchema, key);
	}
}
