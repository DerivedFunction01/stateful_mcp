import type { OrderedLearningHistoryKey } from "../learning/ordered-learning-store";

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
