import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
} from "@stateful-mcp/core";
import type { OrderedLearningHistoryKey } from "../learning/interfaces";

export type OrderedLearningSqlDialect = "sqlite" | "postgres" | "duckdb";

export interface OrderedLearningHistoryPlan {
	table: string;
	key: OrderedLearningHistoryKey;
}

export interface OrderedLearningInsertPlan {
	table: string;
	cellId: string;
	soapNoteId: string | null;
	tag: string;
	targetSchema: string;
	rawText: string;
	patientId: string | null;
	patientOrganismType: string | null;
	patientGender: string | null;
	patientAgeBucket: string | null;
	patientSpeciesBucket: string | null;
	patientSubBucket: number | null;
	patientBucketKey: string | null;
	personnelId: string | null;
	specialtyId: string | null;
	facilityId: string | null;
	orderedTokensJson: string;
	relationsJson: string;
	parsedItemJson: string;
	priorAcceptCount: number;
	priorCorrectionCount: number;
	lastAcceptedAt: string;
	lastCorrectedAt: string | null;
	recencyScore: number;
	contractValid: number;
	stalePreference: number;
	reviewRequired: number;
}

export interface OrderedLearningCorrectionPlan {
	table: string;
	cellId: string;
	priorCorrectionCount: number;
	lastCorrectedAt: string;
	recencyScore: number;
	parsedItemJson: string | null;
}

export interface OrderedLearningQuery {
	sql: string;
	params: unknown[];
}

export class OrderedLearningSqlCompiler {
	private readonly dialect: OrderedLearningSqlDialect;
	private readonly compiler: QueryCompiler;

	private static readonly OPTIONAL_FIELDS = [
		"soapNoteId",
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

	private static readonly INSERT_COLUMNS = [
		"cellId",
		"soapNoteId",
		"tag",
		"targetSchema",
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
		"orderedTokens",
		"relations",
		"parsedItem",
		"priorAcceptCount",
		"priorCorrectionCount",
		"lastAcceptedAt",
		"lastCorrectedAt",
		"recencyScore",
		"contractValid",
		"stalePreference",
		"reviewRequired",
	] as const;

	constructor(dialect: OrderedLearningSqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public getTableDDL(table: string): CompiledQuery {
		const createDDL = this.compiler.compileCreateTable({
			table: table,
			ifNotExists: true,
			columns: [
				{ name: "cellId", type: "TEXT", primaryKey: true },
				{ name: "soapNoteId", type: "TEXT" },
				{ name: "tag", type: "TEXT", nullable: false },
				{ name: "targetSchema", type: "TEXT", nullable: false },
				{ name: "rawText", type: "TEXT", nullable: false },
				{ name: "patientId", type: "TEXT" },
				{ name: "patientOrganismType", type: "TEXT" },
				{ name: "patientGender", type: "TEXT" },
				{ name: "patientAgeBucket", type: "TEXT" },
				{ name: "patientSpeciesBucket", type: "TEXT" },
				{ name: "patientSubBucket", type: "INTEGER" },
				{ name: "patientBucketKey", type: "TEXT" },
				{ name: "personnelId", type: "TEXT" },
				{ name: "specialtyId", type: "TEXT" },
				{ name: "facilityId", type: "TEXT" },
				{
					name: "orderedTokens",
					type: "TEXT",
					nullable: false,
					default: "[]",
				},
				{ name: "relations", type: "TEXT", nullable: false, default: "[]" },
				{ name: "parsedItem", type: "TEXT", nullable: false, default: "{}" },
				{
					name: "priorAcceptCount",
					type: "INTEGER",
					nullable: false,
					default: 1,
				},
				{
					name: "priorCorrectionCount",
					type: "INTEGER",
					nullable: false,
					default: 0,
				},
				{ name: "lastAcceptedAt", type: "TEXT" },
				{ name: "lastCorrectedAt", type: "TEXT" },
				{ name: "recencyScore", type: "REAL", nullable: false, default: 0 },
				{
					name: "contractValid",
					type: "INTEGER",
					nullable: false,
					default: 1,
				},
				{
					name: "stalePreference",
					type: "INTEGER",
					nullable: false,
					default: 0,
				},
				{
					name: "reviewRequired",
					type: "INTEGER",
					nullable: false,
					default: 0,
				},
			],
		});
		return createDDL;
	}
	/**
	 * Composes the history SELECT via the core QueryCompiler AST.
	 * Uses structured WHERE + ORDER BY; only the flat-table column names
	 * are passed directly (no JSON extraction needed for ordered-learning).
	 */
	public compileHistoryQuery(
		plan: OrderedLearningHistoryPlan,
		paramOffset?: number,
	): OrderedLearningQuery {
		const { table, key } = plan;

		const where: QueryCondition[] = [
			{ column: "tag", op: "eq" as const, value: key.tag },
			{ column: "targetSchema", op: "eq" as const, value: key.targetSchema },
			{ column: "rawText", op: "eq" as const, value: key.rawText },
		];

		for (const field of OrderedLearningSqlCompiler.OPTIONAL_FIELDS) {
			const value = key[field];
			if (value !== undefined && value !== null) {
				where.push({ column: field, op: "eq" as const, value });
			}
		}

		return this.compiler.compileSelect(
			{
				table,
				where,
				orderBy: [{ column: "recencyScore", direction: "DESC" }],
			},
			paramOffset,
		);
	}

	/**
	 * Composes the INSERT via the core QueryCompiler AST.
	 * Maps plan fields to flat column names and uses compileInsert()
	 * with the appropriate onConflict strategy per dialect.
	 */
	public compileInsertQuery(
		plan: OrderedLearningInsertPlan,
		paramOffset?: number,
	): OrderedLearningQuery {
		const colMap: Record<string, unknown> = {
			orderedTokens: plan.orderedTokensJson,
			relations: plan.relationsJson,
			parsedItem: plan.parsedItemJson,
		};

		const values = OrderedLearningSqlCompiler.INSERT_COLUMNS.map(
			(col) => colMap[col] ?? (plan as unknown as Record<string, unknown>)[col],
		);

		const conflictColumns = this.dialect === "sqlite" ? undefined : ["cellId"];

		return this.compiler.compileInsert(
			{
				table: plan.table,
				columns: [...OrderedLearningSqlCompiler.INSERT_COLUMNS],
				values: [values as unknown as Record<string, unknown>],
				onConflict: "replace",
				conflictColumns,
			},
			paramOffset,
		);
	}

	/**
	 * Composes the correction UPDATE via the core QueryCompiler AST.
	 * Mirrors the v1 conditional SET logic but delegates SQL generation
	 * to compileUpdate().
	 */
	public compileCorrectionQuery(
		plan: OrderedLearningCorrectionPlan,
		paramOffset?: number,
	): OrderedLearningQuery {
		const set: Record<string, unknown> = {
			priorCorrectionCount: plan.priorCorrectionCount,
			lastCorrectedAt: plan.lastCorrectedAt,
			recencyScore: plan.recencyScore,
			stalePreference: 1,
		};

		if (plan.parsedItemJson) {
			set.reviewRequired = 1;
			set.parsedItem = plan.parsedItemJson;
		} else {
			set.reviewRequired = 0;
		}

		return this.compiler.compileUpdate(
			{
				table: plan.table,
				set,
				where: [{ column: "cellId", op: "eq" as const, value: plan.cellId }],
			},
			paramOffset,
		);
	}

	/**
	 * Composes the index DDL queries.
	 */
	public getIndexDDL(table: string): CompiledQuery[] {
		return [
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}`,
				columns: ["patientId", "tag", "targetSchema"],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_personnel`,
				columns: ["personnelId", "specialtyId"],
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_recency`,
				columns: ["recencyScore"],
			}),
		];
	}
}
