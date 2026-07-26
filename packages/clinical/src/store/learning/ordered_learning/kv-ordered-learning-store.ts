import type { KvBackend } from "@stateful-mcp/core";
import {
	MAX_ORDERED_TOKENS,
	type OrderedLearningHistoryKey,
	type OrderedLearningRecord,
	type OrderedLearningRecordInput,
	type OrderedLearningStore,
	scoreRecency,
} from "../interfaces";
import { buildOrderedRelations } from "../ordered-learning-store";

export class KvOrderedLearningStore implements OrderedLearningStore {
	constructor(private backend: KvBackend) {}

	async getHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningRecord[]> {
		const data = await this.backend.load();

		const exactMatchKeys = [
			"targetSchema",
			"tag",
			"rawText",
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

		return Object.entries(data)
			.reduce<OrderedLearningRecord[]>((matches, [k, v]) => {
				if (!k.startsWith("record:")) return matches;

				const row = v as OrderedLearningRecord;

				// Check all criteria using the array definition
				const hasMismatch = exactMatchKeys.some((kName) => {
					const keyValue = key[kName];
					// If the filter key is undefined/falsy (except for explicit undefined checks like patientSubBucket), skip check
					if (keyValue === undefined) return false;
					return row[kName] !== keyValue;
				});

				if (!hasMismatch) {
					matches.push(row);
				}

				return matches;
			}, [])
			.sort(
				(a, b) =>
					(b.history?.recencyScore ?? 0) - (a.history?.recencyScore ?? 0),
			);
	}

	async putRecord(record: OrderedLearningRecordInput): Promise<void> {
		const data = await this.backend.load();
		const existing = data[`record:${record.shared.cellId}`] as
			| OrderedLearningRecord
			| undefined;

		const now = new Date().toISOString();
		const orderedTokens = record.orderedTokens.slice(0, MAX_ORDERED_TOKENS);
		const relations = buildOrderedRelations(
			orderedTokens,
			record.shared.cellId,
		);

		const full: OrderedLearningRecord = {
			cellId: record.shared.cellId,
			soapNoteId: record.shared.soapNoteId,
			tag: record.shared.tag,
			targetSchema: record.shared.targetSchema,
			rawText: record.shared.rawText,
			patientId: record.shared.patientId,
			patientOrganismType: record.shared.patientOrganismType,
			patientGender: record.shared.patientGender,
			patientAgeBucket: record.shared.patientAgeBucket,
			patientSpeciesBucket: record.shared.patientSpeciesBucket,
			patientSubBucket: record.shared.patientSubBucket,
			patientBucketKey: record.shared.patientBucketKey,
			personnelId: record.shared.personnelId,
			specialtyId: record.shared.specialtyId,
			facilityId: record.shared.facilityId,
			orderedTokens,
			relations,
			parsedItem: record.parsedItem,
			history: {
				priorAcceptCount: (existing?.history?.priorAcceptCount || 0) + 1,
				priorCorrectionCount: existing?.history?.priorCorrectionCount || 0,
				lastAcceptedAt: record.shared.acceptedAt ?? now,
				lastCorrectedAt: existing?.history?.lastCorrectedAt,
				recencyScore: scoreRecency(record.shared.acceptedAt ?? now),
			},
			flags: {
				contractValid: true,
				stalePreference: !!existing?.history?.priorCorrectionCount,
				reviewRequired: false,
			},
		};

		await this.backend.set(`record:${record.shared.cellId}`, full);
		await this.backend.save();
	}

	async markCorrection(
		cellId: string,
		replacement?: OrderedLearningRecordInput["parsedItem"],
	): Promise<void> {
		const data = await this.backend.load();
		const record = data[`record:${cellId}`] as
			| OrderedLearningRecord
			| undefined;
		if (!record) return;

		const now = new Date().toISOString();
		record.history = {
			...(record.history || {}),
			priorCorrectionCount: (record.history?.priorCorrectionCount || 0) + 1,
			lastCorrectedAt: now,
			recencyScore: scoreRecency(now),
		};
		record.flags = {
			...(record.flags || {}),
			stalePreference: true,
			reviewRequired: !!replacement,
		};
		if (replacement) {
			record.parsedItem = replacement;
		}

		await this.backend.set(`record:${cellId}`, record);
		await this.backend.save();
	}
}
