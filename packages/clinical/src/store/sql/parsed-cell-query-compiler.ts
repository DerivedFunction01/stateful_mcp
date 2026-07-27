import type { ColumnDef, SqlDialect } from "@stateful-mcp/core";
import {
	type CompiledQuery,
	inferSqlType,
	QueryCompiler,
	type QueryCondition,
	type SelectQuery,
} from "@stateful-mcp/core";
import type { ParsedCellHistoryKey } from "../learning/interfaces";
import type {
	ParsedCellRecordTransform,
	TransformIndexSpec,
} from "../learning/parsed_cell/parsed-cell-record-transform";

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

const SHARED_TABLE_COLUMNS: ColumnDef[] = [
	{ name: "cellId", type: "TEXT", nullable: false, primaryKey: true },
	{ name: "targetSchema", type: "TEXT", nullable: false },
	{ name: "tag", type: "TEXT", nullable: false },
	{ name: "rawText", type: "TEXT", nullable: false },
	{ name: "normalizedText", type: "TEXT", nullable: true },
	{ name: "sessionId", type: "TEXT", nullable: true },
	{ name: "soapNoteId", type: "TEXT", nullable: true },
	{ name: "patientId", type: "TEXT", nullable: true },
	{ name: "patientOrganismType", type: "TEXT", nullable: true },
	{ name: "patientGender", type: "TEXT", nullable: true },
	{ name: "patientAgeBucket", type: "TEXT", nullable: true },
	{ name: "patientSpeciesBucket", type: "TEXT", nullable: true },
	{ name: "patientSubBucket", type: "INTEGER", nullable: true },
	{ name: "patientBucketKey", type: "TEXT", nullable: true },
	{ name: "patientTierWeights", type: "TEXT", nullable: true },
	{ name: "personnelId", type: "TEXT", nullable: true },
	{ name: "specialtyId", type: "TEXT", nullable: true },
	{ name: "facilityId", type: "TEXT", nullable: true },
	{ name: "workspaceId", type: "TEXT", nullable: true },
	{ name: "anchorText", type: "TEXT", nullable: true },
	{ name: "parserVersion", type: "TEXT", nullable: true },
	{ name: "contractVersion", type: "TEXT", nullable: true },
	{ name: "sourceKind", type: "TEXT", nullable: true },
	{ name: "outcome", type: "TEXT", nullable: true },
	{ name: "replacedByCellId", type: "TEXT", nullable: true },
	{ name: "acceptedAt", type: "TEXT", nullable: true },
	{ name: "createdAt", type: "TEXT", nullable: false },
	{ name: "updatedAt", type: "TEXT", nullable: false },
];

const SHARED_INDEXES: { columns: string[]; name?: string }[] = [
	{ columns: ["targetSchema", "tag", "rawText"], name: "idx_shared_lookup" },
	{ columns: ["patientId", "targetSchema"], name: "idx_shared_patient" },
	{ columns: ["sessionId"], name: "idx_shared_session" },
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

export function extractSharedValues(
	shared: Record<string, any>,
): Record<string, any> {
	const values: Record<string, any> = {};
	for (const col of SHARED_TABLE_COLUMNS) {
		const name = col.name;
		if (name === "cellId") {
			values.cellId = shared.cellId;
		} else if (name === "patientTierWeights") {
			const v = shared[name];
			values[name] = v !== undefined ? JSON.stringify(v) : null;
		} else {
			values[name] = shared[name] ?? null;
		}
	}
	return values;
}

export function rehydrateParsedShared(
	row: Record<string, any>,
): Record<string, any> {
	const shared: Record<string, any> = {};
	for (const col of SHARED_TABLE_COLUMNS) {
		const name = col.name;
		const val = row[name];
		if (name === "patientTierWeights" && typeof val === "string") {
			try {
				shared[name] = JSON.parse(val);
			} catch {
				shared[name] = null;
			}
		} else {
			shared[name] = val ?? undefined;
		}
	}
	return shared as any;
}

export class ParsedCellSqlCompilerV2 {
	private readonly compiler: QueryCompiler;
	private detailColumnCache = new Map<string, ColumnDef[]>();

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
	dialect: string;

	constructor(dialect: SqlDialect = "sqlite") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	public compileCreateSharedTable(): CompiledQuery {
		return this.compiler.compileCreateTable({
			table: "parsed_cell_shared",
			ifNotExists: true,
			columns: SHARED_TABLE_COLUMNS,
		});
	}

	public compileSharedIndexes(): CompiledQuery[] {
		return SHARED_INDEXES.map((spec) =>
			this.compiler.compileCreateIndex({
				table: "parsed_cell_shared",
				name: spec.name || autoIndexName("parsed_cell_shared", spec.columns),
				columns: spec.columns,
				ifNotExists: true,
			}),
		);
	}

	public compileSharedInsert(values: Record<string, any>): CompiledQuery {
		const columnNames = SHARED_TABLE_COLUMNS.map((col) => col.name);
		const row = Object.fromEntries(
			columnNames.map((name) => [name, values[name] ?? null]),
		);
		return this.compiler.compileInsert({
			table: "parsed_cell_shared",
			values: [row],
			columns: columnNames,
			onConflict: "replace",
		});
	}

	public compileCreateDetailTable(
		detailTableName: string,
		transform: ParsedCellRecordTransform,
	): CompiledQuery {
		const columns = this.getMergedColumns(transform);
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
		const columns = this.getMergedColumns(transform);
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

	public compileScoringExpression(
		alias = "ranking_score",
		weightAccept = 0.2,
		weightCorrection = 0.15,
	): {
		raw: string;
		alias: string;
	} {
		return {
			raw: `("recencyScore" + ("priorAcceptCount" * ${weightAccept}) + (CASE WHEN "contractValid" IN (1,'true','1') THEN 1 ELSE 0 END) - ("priorCorrectionCount" * ${weightCorrection}))`,
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
				column: "targetSchema",
				table: "shared",
				op: "eq",
				value: plan.key.targetSchema,
			},
			{
				column: "tag",
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
						column: field,
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
					column: "rawText",
					table: "shared",
					op: "eq",
					value: plan.key.rawText,
				},
				{
					column: "normalizedText",
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
			raw: `"shared"."cellId"`,
		};

		const select: SelectQuery["select"] = [
			{ raw: `"shared".*` },
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

	private getMergedColumns(transform: ParsedCellRecordTransform): ColumnDef[] {
		const cacheKey = transform.targetSchema;
		const cached = this.detailColumnCache.get(cacheKey);
		if (cached) return cached;

		const columns = buildMergedColumns(transform);
		this.detailColumnCache.set(cacheKey, columns);
		return columns;
	}
}

function buildMergedColumns(transform: ParsedCellRecordTransform): ColumnDef[] {
	const flatColumns: ColumnDef[] = transform.columnSpecs
		? transform.columnSpecs
		: Object.entries(transform.flatten(transform.template())).map(
				([path, value]) => ({
					name: path,
					type: inferSqlType(value),
					nullable: true,
				}),
			);
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
		if (seen.has(col.name)) continue;
		seen.add(col.name);

		const rawDefault =
			typeof col.default === "boolean" ? (col.default ? "1" : "0") : undefined;

		result.push({
			name: col.name,
			type: col.type,
			nullable: col.nullable ?? true,
			default: rawDefault !== undefined ? undefined : (col.default ?? null),
			defaultRaw: rawDefault ?? col.defaultRaw,
			primaryKey: col.primaryKey,
			unique: col.unique,
			check: col.check,
			raw: col.raw,
			autoIncrement: col.autoIncrement,
		} as ColumnDef);
	}

	return result;
}
