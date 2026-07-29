import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../parser/schema-parsers";
import {
	type OrderedLearningInsertPlan,
	OrderedLearningSqlCompiler,
} from "../../sql/ordered-learning-query-compiler";
import type {
	OrderedLearningHistoryKey,
	OrderedLearningRecord,
	OrderedLearningRecordInput,
	OrderedLearningStore,
	OrderedLearningToken,
} from "../interfaces";
import { MAX_ORDERED_TOKENS, scoreRecency } from "../interfaces";
import { buildOrderedRelations } from "./helpers";

const DEFAULT_TABLE = "ordered_learning_records";

export class SqlOrderedLearningStore implements OrderedLearningStore {
	private compiler: OrderedLearningSqlCompiler;
	private dialect: SqlDialect;
	private table: string;
	private executor: SqlExecutor;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table: string = DEFAULT_TABLE,
	) {
		this.dialect = dialect;
		this.executor = executor;
		this.compiler = new OrderedLearningSqlCompiler(this.dialect);
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		await this.executor.exec(this.compiler.getTableDDL(this.table).sql);

		// Indexes
		const indexes = this.compiler.getIndexDDL(this.table);
		for (const idx of indexes) {
			await this.executor.exec(idx.sql, idx.params);
		}
	}

	async getHistory(
		key: OrderedLearningHistoryKey,
	): Promise<OrderedLearningRecord[]> {
		const { sql, params } = this.compiler.compileHistoryQuery({
			table: this.table,
			key,
		});

		const rows = await this.executor.query(sql, params);
		return rows.map((row) => this.rowToRecord(row));
	}

	async putRecord(record: OrderedLearningRecordInput): Promise<void> {
		const c = this.executor.compiler;
		const now = new Date().toISOString();
		const existingQuery = c.compileSelect({
			table: this.table,
			where: [{ column: "cellId", op: "eq", value: record.shared.cellId }],
		});
		const existingRows = await this.executor.query(
			existingQuery.sql,
			existingQuery.params,
		);
		const existing = existingRows[0] ?? null;

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

		const { sql, params } = this.compiler.compileInsertQuery(insertPlan);
		await this.executor.exec(sql, params);
	}

	async markCorrection(
		cellId: string,
		replacement?: OrderedLearningRecordInput["parsedItem"],
	): Promise<void> {
		const c = this.executor.compiler;
		const existingQuery = c.compileSelect({
			table: this.table,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
		const existingRows = await this.executor.query(
			existingQuery.sql,
			existingQuery.params,
		);
		const existing = existingRows[0] ?? null;
		if (!existing) return;

		const now = new Date().toISOString();
		const priorCorrectionCount =
			(Number(existing.priorCorrectionCount) || 0) + 1;

		const { sql, params } = this.compiler.compileCorrectionQuery({
			table: this.table,
			cellId,
			priorCorrectionCount,
			lastCorrectedAt: now,
			recencyScore: scoreRecency(now),
			parsedItemJson: replacement ? JSON.stringify(replacement) : null,
		});
		await this.executor.exec(sql, params);
	}

	private rowToRecord(row: Record<string, unknown>): OrderedLearningRecord {
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
			orderedTokens: row.orderedTokens as OrderedLearningToken[],
			relations: row.relations as any[],
			parsedItem: row.parsedItem as ParsedItem,
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
				contractValid: Boolean(row.contractValid),
				stalePreference: Boolean(row.stalePreference),
				reviewRequired: Boolean(row.reviewRequired),
			},
		};
	}
}
