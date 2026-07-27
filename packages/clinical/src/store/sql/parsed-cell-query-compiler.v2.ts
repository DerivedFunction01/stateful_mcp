import type { ColumnDef } from "@stateful-mcp/core";
import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SelectQuery,
} from "@stateful-mcp/core";
import type { ParsedCellHistoryKey } from "../learning/interfaces.v2";
import type {
	ParsedCellRecordTransform,
	TransformIndexSpec,
} from "../learning/parsed_cell/parsed-cell-record-transform";
import { buildColumnSpecs } from "../learning/parsed_cell/parsed-cell-record-transform";

export type ParsedCellSqlDialect = "sqlite" | "postgres" | "duckdb";

export interface ParsedCellHistoryPlan {
	detailTableName: string;
	sharedTableName: string;
	key: ParsedCellHistoryKey;
	scope: "scoped" | "global";
	limit?: number;
	weightAccept?: number;
	weightCorrection?: number;
}

export interface ParsedCellHistoryQuery {
	sql: string;
	params: unknown[];
}

const DEFAULT_SCORING_COLUMNS: {
	name: string;
	sqlType: "text" | "int" | "real";
	default: string | number;
	nullable: boolean;
	primaryKey?: boolean;
}[] = [
	{
		name: "cellId",
		sqlType: "text",
		default: "",
		nullable: false,
		primaryKey: true,
	},
	{ name: "recencyScore", sqlType: "real", default: 0, nullable: false },
	{ name: "priorAcceptCount", sqlType: "int", default: 0, nullable: false },
	{ name: "priorCorrectionCount", sqlType: "int", default: 0, nullable: false },
	{ name: "contractValid", sqlType: "int", default: 1, nullable: false },
	{ name: "stalePreference", sqlType: "int", default: 0, nullable: false },
	{ name: "reviewRequired", sqlType: "int", default: 0, nullable: false },
];

const DETAIL_TABLE_BY_SCHEMA: Record<string, string> = {
	ObservationEvent: "parsed_cell_observation_detail",
	VitalsMeasurementEvent: "parsed_cell_vitals_detail",
	MedicationOrderObject: "parsed_cell_medication_detail",
	ClinicalDateRange: "parsed_cell_date_range_detail",
};

export function resolveDetailTable(targetSchema: string): string {
	return (
		DETAIL_TABLE_BY_SCHEMA[targetSchema] ||
		`parsed_cell_${targetSchema.toLowerCase()}_detail`
	);
}

export function autoIndexName(table: string, columns: string[]): string {
	return `idx_${table}_${columns.join("_")}`;
}

export class ParsedCellSqlCompilerV2 {
	private readonly compiler: QueryCompiler;

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

	constructor(dialect: ParsedCellSqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public compileCreateDetailTable(
		detailTableName: string,
		transform: ParsedCellRecordTransform,
	): CompiledQuery {
		const columns = buildMergedColumns(transform);
		return this.compiler.compileCreateTable({
			table: detailTableName,
			ifNotExists: true,
			columns,
		});
	}

	public compileCreateIndexes(
		detailTableName: string,
		indexes?: TransformIndexSpec[],
	): CompiledQuery[] {
		if (!indexes || indexes.length === 0) {
			return [];
		}
		return indexes.map((indexSpec) => {
			const name = autoIndexName(detailTableName, indexSpec.columns);
			return this.compiler.compileCreateIndex({
				table: detailTableName,
				name,
				columns: indexSpec.columns,
				unique: indexSpec.unique,
				ifNotExists: true,
			});
		});
	}

	public compileDetailInsert(
		detailTableName: string,
		transform: ParsedCellRecordTransform,
		values: Record<string, any>,
	): CompiledQuery {
		const columns = buildMergedColumns(transform);
		const columnNames = columns.map((col) => col.name);
		const row = Object.fromEntries(
			columnNames.map((name) => [name, values[name] ?? null]),
		);
		return this.compiler.compileInsert({
			table: detailTableName,
			values: [row],
			columns: columnNames,
			onConflict: "replace",
		});
	}

	public compileDetailUpdate(
		detailTableName: string,
		cellId: string,
		values: Record<string, any>,
	): CompiledQuery {
		return this.compiler.compileUpdate({
			table: detailTableName,
			set: values,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
	}

	public compileScoringExpression(alias = "ranking_score"): {
		raw: string;
		alias: string;
	} {
		return {
			raw: `("recencyScore" + ("priorAcceptCount" * :weightAccept) + (CASE WHEN "contractValid" IN (1,'true','1') THEN 1 ELSE 0 END) - ("priorCorrectionCount" * :weightCorrection))`,
			alias,
		};
	}

	public compileHistoryQuery(
		plan: ParsedCellHistoryPlan,
	): ParsedCellHistoryQuery {
		const weightAccept = plan.weightAccept ?? 0.2;
		const weightCorrection = plan.weightCorrection ?? 0.15;
		const scoringAlias = "ranking_score";

		const where: QueryCondition[] = [
			{
				column: "data",
				jsonPath: "targetSchema",
				table: "shared",
				op: "eq",
				value: plan.key.targetSchema,
			},
			{
				column: "data",
				jsonPath: "tag",
				table: "shared",
				op: "eq",
				value: plan.key.tag,
			},
		];

		if (plan.scope === "scoped") {
			for (const field of ParsedCellSqlCompilerV2.SCOPED_FIELDS) {
				const val = plan.key[field];
				if (val !== undefined && val !== null) {
					where.push({
						column: "data",
						jsonPath: field,
						table: "shared",
						op: "eq",
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
					op: "eq",
					value: plan.key.rawText,
				},
				{
					column: "data",
					jsonPath: "normalizedText",
					table: "shared",
					op: "eq",
					value: plan.key.rawText,
				},
			],
		};

		const joinCondition = {
			column: "cellId",
			table: "detail",
			op: "eq" as const,
			raw: this.compiler.formatColumn("data", "cellId", "shared"),
		};

		const select: SelectQuery["select"] = [
			{ column: "data", table: "shared", alias: "shared_data" },
			{ raw: `"detail".*` },
			{
				raw: `("recencyScore" + ("priorAcceptCount" * ${weightAccept}) + (CASE WHEN "contractValid" IN (1,'true','1') THEN 1 ELSE 0 END) - ("priorCorrectionCount" * ${weightCorrection}))`,
				alias: scoringAlias,
			},
		];

		const compiled = this.compiler.compileSelect(
			{
				table: plan.sharedTableName,
				alias: "shared",
				select,
				joins: [
					{
						type: "inner",
						table: plan.detailTableName,
						alias: "detail",
						on: [joinCondition],
					},
				],
				where: [...where, rawOrNormalized],
				orderBy: [{ column: scoringAlias, direction: "DESC" }],
				limit: plan.limit,
			},
			undefined,
		);

		return { sql: compiled.sql, params: compiled.params };
	}
}

function buildMergedColumns(transform: ParsedCellRecordTransform): ColumnDef[] {
	const flatColumns = buildColumnSpecs(transform);
	const seen = new Set<string>();
	const result: ColumnDef[] = [];

	for (const col of DEFAULT_SCORING_COLUMNS) {
		result.push({
			name: col.name,
			type: col.sqlType,
			nullable: col.nullable,
			default: col.default,
			primaryKey: col.primaryKey,
		});
		seen.add(col.name);
	}

	for (const col of flatColumns) {
		if (seen.has(col.path)) continue;
		seen.add(col.path);

		const rawDefault =
			col.default === false ? "0" : col.default === true ? "1" : undefined;

		result.push({
			name: col.path,
			type: col.sqlType,
			nullable: col.nullable ?? true,
			default: rawDefault !== undefined ? undefined : (col.default ?? null),
			defaultRaw: rawDefault,
		} as ColumnDef);
	}

	return result;
}
