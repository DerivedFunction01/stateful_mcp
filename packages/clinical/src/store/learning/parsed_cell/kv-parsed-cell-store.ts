import type { KvBackend } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../parser/schema-parsers";
import type {
	ParsedCellHistoryKey,
	ParsedCellLookup,
	ParsedCellRankerContext,
	ParsedCellRecord,
	ParsedCellStore,
	SystemWeightStore,
} from "../interfaces";
import { scoreRecency } from "../interfaces";
import { KvBackendSystemWeightStore } from "./field-weight-store";
import type { ParsedCellHistoryStore } from "./history-store";
import { GenericPreferenceRanker } from "./ranker";

function compositeHistoryScore(history?: {
	recencyScore?: number;
	priorAcceptCount?: number;
	priorCorrectionCount?: number;
	contractValid?: boolean;
}): number {
	const recency = history?.recencyScore ?? 0;
	const accepts = history?.priorAcceptCount ?? 0;
	const corrections = history?.priorCorrectionCount ?? 0;
	const contract = history?.contractValid ? 1 : 0;
	return recency + accepts * 0.2 + contract - corrections * 0.15;
}

export class KvParsedCellStore
	implements ParsedCellStore, ParsedCellHistoryStore
{
	private readonly weightStore: SystemWeightStore;

	constructor(
		private backend: KvBackend,
		weightStore?: SystemWeightStore,
	) {
		this.weightStore = weightStore || new KvBackendSystemWeightStore(backend);
	}

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

		return matches.sort((a, b) => {
			const scoreA = compositeHistoryScore(a.learningMetadata.history);
			const scoreB = compositeHistoryScore(b.learningMetadata.history);
			return scoreB - scoreA;
		});
	}

	async rankHistoryBySchema(
		targetSchema: string,
		key: ParsedCellHistoryKey,
		candidate: ParsedItem,
	): Promise<
		Array<ParsedCellRecord & { rankScore: number; rankReason: string }>
	> {
		const history = await this.getHistoryBySchema(targetSchema, key);
		const context: ParsedCellRankerContext = {
			tag: key.tag,
			targetSchema,
			rawText: key.rawText,
			history,
			patientId: key.patientId,
			patientOrganismType: key.patientOrganismType,
			patientGender: key.patientGender,
			patientAgeBucket: key.patientAgeBucket,
			patientSpeciesBucket: key.patientSpeciesBucket,
			patientSubBucket: key.patientSubBucket,
			patientBucketKey: key.patientBucketKey,
			personnelId: key.personnelId,
			specialtyId: key.specialtyId,
			facilityId: key.facilityId,
		};

		const ranker = new GenericPreferenceRanker(this.weightStore);
		await ranker.loadWeights(targetSchema);
		return history
			.map((record) => {
				const { score, reason } = ranker.score(record, context);
				return { ...record, rankScore: score, rankReason: reason ?? "" };
			})
			.sort((a, b) => b.rankScore - a.rankScore);
	}

	async adjustWeights(
		candidate: ParsedItem,
		key: ParsedCellHistoryKey,
		accepted: boolean,
	): Promise<void> {
		const history = await this.getHistoryBySchema(key.targetSchema, key);
		const context: ParsedCellRankerContext = {
			tag: key.tag,
			targetSchema: key.targetSchema,
			rawText: key.rawText,
			history,
			patientId: key.patientId,
			patientOrganismType: key.patientOrganismType,
			patientGender: key.patientGender,
			patientAgeBucket: key.patientAgeBucket,
			patientSpeciesBucket: key.patientSpeciesBucket,
			patientSubBucket: key.patientSubBucket,
			patientBucketKey: key.patientBucketKey,
			personnelId: key.personnelId,
			specialtyId: key.specialtyId,
			facilityId: key.facilityId,
		};

		const ranker = new GenericPreferenceRanker(this.weightStore);
		await ranker.loadWeights(key.targetSchema);
		const record: ParsedCellRecord = {
			shared: {} as ParsedCellRecord["shared"],
			parsedItem: candidate,
			learningMetadata: { history: {}, flags: {} },
		};
		await ranker.adjustWeights(record, context, accepted);
	}

	async getHistory(key: ParsedCellHistoryKey): Promise<ParsedCellRecord[]> {
		return this.getHistoryBySchema(key.targetSchema, key);
	}
}
