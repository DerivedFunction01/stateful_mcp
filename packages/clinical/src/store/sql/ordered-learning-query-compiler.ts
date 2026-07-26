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

// ── Dialect helpers ──────────────────────────────────────────────────────────

function placeholder(
	dialect: OrderedLearningSqlDialect,
	index: number,
): string {
	return dialect === "postgres" ? `$${index}` : "?";
}

function jsonField(dialect: OrderedLearningSqlDialect, field: string): string {
	if (dialect === "postgres") {
		return `data::jsonb ->> '${field}'`;
	}
	if (dialect === "duckdb") {
		return `json_extract_string(data, '$.${field}')`;
	}
	return `json_extract(data, '$.${field}')`;
}

function appendEquals(
	dialect: OrderedLearningSqlDialect,
	clauses: string[],
	params: unknown[],
	field: string,
	value: unknown,
): void {
	if (value === undefined || value === null) return;
	const idx = params.length + 1;
	clauses.push(`${field} = ${placeholder(dialect, idx)}`);
	params.push(value);
}

// ── History query ────────────────────────────────────────────────────────────

/**
 * Compiles a SELECT query for ordered observation history.
 *
 * Uses a flat table with all columns (no shared/detail join needed
 * for the order-aware store since it stores everything in one row).
 */
export function compileOrderedLearningHistoryQuery(
	plan: OrderedLearningHistoryPlan,
	dialect: OrderedLearningSqlDialect = "sqlite",
): OrderedLearningQuery {
	const { table, key } = plan;
	const clauses: string[] = [];
	const params: unknown[] = [];

	clauses.push(`tag = ${placeholder(dialect, params.length + 1)}`);
	params.push(key.tag);

	clauses.push(`targetSchema = ${placeholder(dialect, params.length + 1)}`);
	params.push(key.targetSchema);

	clauses.push(`rawText = ${placeholder(dialect, params.length + 1)}`);
	params.push(key.rawText);

	appendEquals(dialect, clauses, params, "soapNoteId", key.soapNoteId);
	appendEquals(dialect, clauses, params, "patientId", key.patientId);
	appendEquals(
		dialect,
		clauses,
		params,
		"patientOrganismType",
		key.patientOrganismType,
	);
	appendEquals(dialect, clauses, params, "patientGender", key.patientGender);
	appendEquals(
		dialect,
		clauses,
		params,
		"patientAgeBucket",
		key.patientAgeBucket,
	);
	appendEquals(
		dialect,
		clauses,
		params,
		"patientSpeciesBucket",
		key.patientSpeciesBucket,
	);
	appendEquals(
		dialect,
		clauses,
		params,
		"patientSubBucket",
		key.patientSubBucket,
	);
	appendEquals(
		dialect,
		clauses,
		params,
		"patientBucketKey",
		key.patientBucketKey,
	);
	appendEquals(dialect, clauses, params, "personnelId", key.personnelId);
	appendEquals(dialect, clauses, params, "specialtyId", key.specialtyId);
	appendEquals(dialect, clauses, params, "facilityId", key.facilityId);

	return {
		sql: `
			SELECT * FROM ${table}
			WHERE ${clauses.join(" AND ")}
			ORDER BY recencyScore DESC
		`,
		params,
	};
}

// ── Insert / upsert ──────────────────────────────────────────────────────────

/**
 * Compiles an INSERT OR REPLACE (sqlite/duckdb) or INSERT ... ON CONFLICT (postgres)
 * for an ordered learning record.
 */
export function compileOrderedLearningInsertQuery(
	plan: OrderedLearningInsertPlan,
	dialect: OrderedLearningSqlDialect = "sqlite",
): OrderedLearningQuery {
	const { table } = plan;
	const columns = [
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
	];

	const values = [
		plan.cellId,
		plan.soapNoteId,
		plan.tag,
		plan.targetSchema,
		plan.rawText,
		plan.patientId,
		plan.patientOrganismType,
		plan.patientGender,
		plan.patientAgeBucket,
		plan.patientSpeciesBucket,
		plan.patientSubBucket,
		plan.patientBucketKey,
		plan.personnelId,
		plan.specialtyId,
		plan.facilityId,
		plan.orderedTokensJson,
		plan.relationsJson,
		plan.parsedItemJson,
		plan.priorAcceptCount,
		plan.priorCorrectionCount,
		plan.lastAcceptedAt,
		plan.lastCorrectedAt,
		plan.recencyScore,
		plan.contractValid,
		plan.stalePreference,
		plan.reviewRequired,
	];

	const placeholders = columns.map((_, i) => placeholder(dialect, i + 1));
	const colList = columns.join(", ");
	const valList = placeholders.join(", ");

	if (dialect === "postgres") {
		// Postgres uses INSERT ... ON CONFLICT DO UPDATE
		const updates = columns
			.filter((c) => c !== "cellId")
			.map((c) => `${c} = EXCLUDED.${c}`)
			.join(", ");
		return {
			sql: `
				INSERT INTO ${table} (${colList})
				VALUES (${valList})
				ON CONFLICT (cellId) DO UPDATE SET ${updates}
			`,
			params: values,
		};
	}

	// sqlite and duckdb support INSERT OR REPLACE
	return {
		sql: `INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${valList})`,
		params: values,
	};
}

// ── Correction update ────────────────────────────────────────────────────────

/**
 * Compiles an UPDATE for marking a correction on an ordered learning record.
 */
export function compileOrderedLearningCorrectionQuery(
	plan: OrderedLearningCorrectionPlan,
	dialect: OrderedLearningSqlDialect = "sqlite",
): OrderedLearningQuery {
	const { table, cellId } = plan;
	const idx = { current: 1 };

	const nextPlaceholder = () => placeholder(dialect, idx.current++);

	if (plan.parsedItemJson) {
		return {
			sql: `
				UPDATE ${table} SET
					priorCorrectionCount = ${nextPlaceholder()},
					lastCorrectedAt = ${nextPlaceholder()},
					recencyScore = ${nextPlaceholder()},
					stalePreference = 1,
					reviewRequired = 1,
					parsedItem = ${nextPlaceholder()}
				WHERE cellId = ${nextPlaceholder()}
			`,
			params: [
				plan.priorCorrectionCount,
				plan.lastCorrectedAt,
				plan.recencyScore,
				plan.parsedItemJson,
				cellId,
			],
		};
	}

	return {
		sql: `
			UPDATE ${table} SET
				priorCorrectionCount = ${nextPlaceholder()},
				lastCorrectedAt = ${nextPlaceholder()},
				recencyScore = ${nextPlaceholder()},
				stalePreference = 1,
				reviewRequired = 0
			WHERE cellId = ${nextPlaceholder()}
		`,
		params: [
			plan.priorCorrectionCount,
			plan.lastCorrectedAt,
			plan.recencyScore,
			cellId,
		],
	};
}

// ── DDL ──────────────────────────────────────────────────────────────────────

/**
 * Returns the CREATE TABLE DDL for the ordered learning records table.
 * Works across sqlite, postgres, and duckdb.
 */
export function getOrderedLearningTableDDL(table: string): string {
	return `
		CREATE TABLE IF NOT EXISTS ${table} (
			cellId TEXT PRIMARY KEY,
			soapNoteId TEXT,
			tag TEXT NOT NULL,
			targetSchema TEXT NOT NULL,
			rawText TEXT NOT NULL,
			patientId TEXT,
			patientOrganismType TEXT,
			patientGender TEXT,
			patientAgeBucket TEXT,
			patientSpeciesBucket TEXT,
			patientSubBucket INTEGER,
			patientBucketKey TEXT,
			personnelId TEXT,
			specialtyId TEXT,
			facilityId TEXT,
			orderedTokens TEXT NOT NULL DEFAULT '[]',
			relations TEXT NOT NULL DEFAULT '[]',
			parsedItem TEXT NOT NULL DEFAULT '{}',
			priorAcceptCount INTEGER NOT NULL DEFAULT 1,
			priorCorrectionCount INTEGER NOT NULL DEFAULT 0,
			lastAcceptedAt TEXT,
			lastCorrectedAt TEXT,
			recencyScore REAL NOT NULL DEFAULT 0,
			contractValid INTEGER NOT NULL DEFAULT 1,
			stalePreference INTEGER NOT NULL DEFAULT 0,
			reviewRequired INTEGER NOT NULL DEFAULT 0
		)
	`;
}

/**
 * Returns index DDL statements for the ordered learning table.
 */
export function getOrderedLearningIndexDDL(table: string): string[] {
	return [
		`CREATE INDEX IF NOT EXISTS idx_${table}_patient_tag ON ${table} (patientId, tag, targetSchema)`,
		`CREATE INDEX IF NOT EXISTS idx_${table}_personnel ON ${table} (personnelId, specialtyId)`,
		`CREATE INDEX IF NOT EXISTS idx_${table}_recency ON ${table} (recencyScore DESC)`,
	];
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
					default: "'[]'",
				},
				{ name: "relations", type: "TEXT", nullable: false, default: "'[]'" },
				{ name: "parsedItem", type: "TEXT", nullable: false, default: "'{}'" },
				{
					name: "priorAcceptCount",
					type: "INTEGER",
					nullable: false,
					default: "1",
				},
				{
					name: "priorCorrectionCount",
					type: "INTEGER",
					nullable: false,
					default: "0",
				},
				{ name: "lastAcceptedAt", type: "TEXT" },
				{ name: "lastCorrectedAt", type: "TEXT" },
				{ name: "recencyScore", type: "REAL", nullable: false, default: "0" },
				{
					name: "contractValid",
					type: "INTEGER",
					nullable: false,
					default: "1",
				},
				{
					name: "stalePreference",
					type: "INTEGER",
					nullable: false,
					default: "0",
				},
				{
					name: "reviewRequired",
					type: "INTEGER",
					nullable: false,
					default: "0",
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
