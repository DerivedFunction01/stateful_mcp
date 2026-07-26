import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
} from "@stateful-mcp/core";
import type { ParsedCellHistoryKey } from "../learning/interfaces";

export type ParsedCellSqlDialect = "sqlite" | "postgres" | "duckdb";

export interface ParsedCellHistoryPlan {
	tableName: string;
	detailTableName: string;
	key: ParsedCellHistoryKey;
	scope: "scoped" | "global";
	limit?: number;
}

export interface ParsedCellHistoryQuery {
	sql: string;
	params: unknown[];
}

function scoreExpression(dialect: ParsedCellSqlDialect): string {
	const acceptCount = `CAST(COALESCE(${detailJsonField(dialect, "history.priorAcceptCount")}, 0) AS REAL)`;
	const correctionCount = `CAST(COALESCE(${detailJsonField(dialect, "history.priorCorrectionCount")}, 0) AS REAL)`;
	const recency = `CAST(COALESCE(${detailJsonField(dialect, "history.recencyScore")}, 0) AS REAL)`;
	const contract = `CASE WHEN COALESCE(${detailJsonField(dialect, "flags.contractValid")}, 0) IN (1, 'true', '1') THEN 1 ELSE 0 END`;
	return `(${recency} + (${acceptCount} * 0.2) + (${contract}) - (${correctionCount} * 0.15))`;
}

function detailJsonField(dialect: ParsedCellSqlDialect, field: string): string {
	if (dialect === "postgres") {
		return `detail.data::jsonb ->> '${field}'`;
	}
	if (dialect === "duckdb") {
		return `json_extract_string(detail.data, '$.${field}')`;
	}
	return `json_extract(detail.data, '$.${field}')`;
}

// ── : Core sql-compiler implementation ─────────────────────────────────

export class ParsedCellSqlCompiler {
	private readonly dialect: ParsedCellSqlDialect;
	private readonly compiler: QueryCompiler;
	private readonly sharedTable: string;
	private readonly detailTable: string;

	private static readonly SCOPED_FIELDS = [
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

	constructor(
		dialect: ParsedCellSqlDialect = "sqlite",
		sharedTable: string,
		detailTable: string,
	) {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
		this.sharedTable = sharedTable;
		this.detailTable = detailTable;
	}

	public compileCreateTables(): CompiledQuery[] {
		const tables: CompiledQuery[] = [];
		for (const table of [this.sharedTable, this.detailTable]) {
			tables.push(
				this.compiler.compileCreateTable({
					table,
					ifNotExists: true,
					columns: [
						{ name: "cellId", type: "TEXT", primaryKey: true },
						{ name: "data", type: "TEXT", nullable: false },
					],
				}),
			);
		}

		return tables;
	}

	/**
	 * Compiles a SELECT query to find a record by its unique cellId.
	 */
	public compileGetQuery(cellId: string, targetTable: string) {
		return this.compiler.compileSelect({
			table: targetTable,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
	}

	/**
	 * Compiles a SELECT query to list all shared records.
	 */
	public compileListSharedQuery() {
		return this.compiler.compileSelect({ table: this.sharedTable });
	}

	/**
	 * Compiles a SELECT query filtered by targetSchema.
	 */
	public compileListByTargetSchemaQuery(targetSchema: string) {
		return this.compiler.compileSelect({
			table: this.sharedTable,
			where: [
				{
					column: "data",
					jsonPath: "targetSchema",
					op: "eq",
					value: targetSchema,
				},
			],
		});
	}

	/**
	 * Composes the parsed cell observation history SELECT via QueryCompiler AST.
	 */
	public compileObservationHistoryQuery(
		plan: ParsedCellHistoryPlan,
		paramOffset?: number,
	): ParsedCellHistoryQuery {
		const scoreExpr = scoreExpression(this.dialect);

		const where: QueryCondition[] = [
			{
				column: "data",
				jsonPath: "targetSchema",
				table: "shared",
				op: "eq" as const,
				value: plan.key.targetSchema,
			},
			{
				column: "data",
				jsonPath: "tag",
				table: "shared",
				op: "eq" as const,
				value: plan.key.tag,
			},
		];

		if (plan.scope === "scoped") {
			for (const field of ParsedCellSqlCompiler.SCOPED_FIELDS) {
				const val = plan.key[field];
				if (val !== undefined && val !== null) {
					where.push({
						column: "data",
						jsonPath: field,
						table: "shared",
						op: "eq" as const,
						value: val,
					});
				}
			}
		}

		const rawOrNormalized: QueryCondition = {
			OR: [
				{
					column: "data",
					jsonPath: "rawText",
					table: "shared",
					op: "eq" as const,
					value: plan.key.rawText,
				},
				{
					column: "data",
					jsonPath: "normalizedText" as const,
					table: "shared",
					op: "eq" as const,
					value: plan.key.rawText,
				},
			],
		};

		const joinCondition = {
			column: "data",
			jsonPath: "cellId",
			table: "detail",
			op: "eq" as const,
			raw: this.compiler.formatColumn("data", "cellId", "shared"),
		};

		const compiled = this.compiler.compileSelect(
			{
				table: plan.tableName,
				alias: "shared",
				select: [
					{ column: "data", table: "detail", alias: "detail_data" },
					{ raw: scoreExpr, alias: "ranking_score" },
				],
				joins: [
					{
						type: "inner",
						table: plan.detailTableName,
						alias: "detail",
						on: [joinCondition],
					},
				],
				where: [...where, rawOrNormalized],
				orderBy: [{ column: "ranking_score", direction: "DESC" }],
				limit: plan.limit,
			},
			paramOffset,
		);

		return { sql: compiled.sql, params: compiled.params };
	}
}
