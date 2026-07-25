import { Database } from "bun:sqlite";
import type { ParsedObservationItem } from "../../parser/schema-parsers";
import {
	compileOrderedLearningCorrectionQuery,
	compileOrderedLearningHistoryQuery,
	compileOrderedLearningInsertQuery,
	getOrderedLearningIndexDDL,
	getOrderedLearningTableDDL,
	type OrderedLearningInsertPlan,
} from "../sql/ordered-learning-query-compiler";
import {
	buildOrderedRelations,
	MAX_ORDERED_TOKENS,
	type OrderedLearningHistoryKey,
	type OrderedLearningRecord,
	type OrderedLearningRecordInput,
	type OrderedLearningStore,
	type OrderedLearningToken,
} from "./ordered-learning-store";
import { scoreRecency } from "./parsed-cell-store";

// ── Table name ───────────────────────────────────────────────────────────────

const DEFAULT_TABLE = "ordered_learning_records";

// ── SQLite Implementation ────────────────────────────────────────────────────

export class SqliteOrderedLearningStore implements OrderedLearningStore {
	private db: Database;
	private table: string;

	constructor(db?: Database, table: string = DEFAULT_TABLE) {
		this.db = db ?? new Database(":memory:");
		this.table = table;
		this.ensureTable();
	}

	private ensureTable(): void {
		this.db.run(getOrderedLearningTableDDL(this.table));
		for (const ddl of getOrderedLearningIndexDDL(this.table)) {
			this.db.run(ddl);
		}
	}

	async getOrderedObservationHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningRecord[]> {
		const { sql, params } = compileOrderedLearningHistoryQuery(
			{ table: this.table, key },
			"sqlite",
		);
		const stmt = this.db.query(sql);
		const rows = stmt.all(...(params as any)) as Array<Record<string, unknown>>;
		return rows.map((row) => this.rowToRecord(row));
	}

	async putOrderedObservation(
		record: OrderedLearningRecordInput,
	): Promise<void> {
		const now = new Date().toISOString();
		const existing = this.db
			.query(`SELECT * FROM ${this.table} WHERE cellId = ?`)
			.get(record.shared.cellId) as Record<string, unknown> | null;

		const priorAcceptCount = existing
			? (Number(existing.priorAcceptCount) || 0) + 1
			: 1;
		const priorCorrectionCount = existing
			? Number(existing.priorCorrectionCount) || 0
			: 0;
		const lastCorrectedAt = existing
			? (existing.lastCorrectedAt as string | undefined)
			: undefined;

		const orderedTokens = record.orderedTokens.slice(0, MAX_ORDERED_TOKENS);
		const relations = buildOrderedRelations(
			orderedTokens,
			record.shared.cellId,
		);

		const insertPlan: OrderedLearningInsertPlan = {
			table: this.table,
			cellId: record.shared.cellId,
			soapNoteId: record.shared.soapNoteId ?? null,
			tag: record.shared.tag,
			targetSchema: record.shared.targetSchema,
			rawText: record.shared.rawText,
			patientId: record.shared.patientId ?? null,
			patientOrganismType: record.shared.patientOrganismType ?? null,
			patientGender: record.shared.patientGender ?? null,
			patientAgeBucket: record.shared.patientAgeBucket ?? null,
			patientSpeciesBucket: record.shared.patientSpeciesBucket ?? null,
			patientSubBucket: record.shared.patientSubBucket ?? null,
			patientBucketKey: record.shared.patientBucketKey ?? null,
			personnelId: record.shared.personnelId ?? null,
			specialtyId: record.shared.specialtyId ?? null,
			facilityId: record.shared.facilityId ?? null,
			orderedTokensJson: JSON.stringify(orderedTokens),
			relationsJson: JSON.stringify(relations),
			parsedItemJson: JSON.stringify(record.parsedItem),
			priorAcceptCount,
			priorCorrectionCount,
			lastAcceptedAt: record.shared.acceptedAt ?? now,
			lastCorrectedAt: lastCorrectedAt ?? null,
			recencyScore: scoreRecency(record.shared.acceptedAt ?? now),
			contractValid: 1,
			stalePreference: priorCorrectionCount > 0 ? 1 : 0,
			reviewRequired: 0,
		};

		const { sql, params } = compileOrderedLearningInsertQuery(
			insertPlan,
			"sqlite",
		);
		this.db.query(sql).run(...(params as any));
	}

	async markOrderedObservationCorrection(
		cellId: string,
		replacement?: OrderedLearningRecordInput["parsedItem"],
	): Promise<void> {
		const existing = this.db
			.query(`SELECT * FROM ${this.table} WHERE cellId = ?`)
			.get(cellId) as Record<string, unknown> | null;
		if (!existing) return;

		const now = new Date().toISOString();
		const priorCorrectionCount =
			(Number(existing.priorCorrectionCount) || 0) + 1;

		const { sql, params } = compileOrderedLearningCorrectionQuery(
			{
				table: this.table,
				cellId,
				priorCorrectionCount,
				lastCorrectedAt: now,
				recencyScore: scoreRecency(now),
				parsedItemJson: replacement ? JSON.stringify(replacement) : null,
			},
			"sqlite",
		);
		this.db.query(sql).run(...(params as any));
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	private rowToRecord(row: Record<string, unknown>): OrderedLearningRecord {
		const orderedTokens: OrderedLearningToken[] = this.parseJson(
			row.orderedTokens,
			[],
		);
		const relations = this.parseJson(row.relations, []);
		const parsedItem = this.parseJson(row.parsedItem, {});

		return {
			cellId: row.cellId as string,
			soapNoteId: (row.soapNoteId as string) || undefined,
			tag: row.tag as string,
			targetSchema: row.targetSchema as string,
			rawText: row.rawText as string,
			patientId: (row.patientId as string) || undefined,
			patientOrganismType: (row.patientOrganismType as string) || undefined,
			patientGender: (row.patientGender as string) || undefined,
			patientAgeBucket: (row.patientAgeBucket as string) || undefined,
			patientSpeciesBucket: (row.patientSpeciesBucket as string) || undefined,
			patientSubBucket: row.patientSubBucket
				? Number(row.patientSubBucket)
				: undefined,
			patientBucketKey: (row.patientBucketKey as string) || undefined,
			personnelId: (row.personnelId as string) || undefined,
			specialtyId: (row.specialtyId as string) || undefined,
			facilityId: (row.facilityId as string) || undefined,
			orderedTokens,
			relations,
			parsedItem: parsedItem as ParsedObservationItem,
			history: {
				priorAcceptCount: row.priorAcceptCount
					? Number(row.priorAcceptCount)
					: undefined,
				priorCorrectionCount: row.priorCorrectionCount
					? Number(row.priorCorrectionCount)
					: undefined,
				lastAcceptedAt: (row.lastAcceptedAt as string) || undefined,
				lastCorrectedAt: (row.lastCorrectedAt as string) || undefined,
				recencyScore: row.recencyScore ? Number(row.recencyScore) : undefined,
			},
			flags: {
				contractValid: row.contractValid === 1,
				stalePreference: row.stalePreference === 1,
				reviewRequired: row.reviewRequired === 1,
			},
		};
	}

	private parseJson<T>(value: unknown, fallback: T): T {
		if (typeof value === "string") {
			try {
				return JSON.parse(value) as T;
			} catch {
				return fallback;
			}
		}
		return fallback;
	}
}
