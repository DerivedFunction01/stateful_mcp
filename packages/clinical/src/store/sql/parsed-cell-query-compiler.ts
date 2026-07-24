import type { ParsedCellHistoryKey } from "../parsed-cell-store";

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

function placeholder(dialect: ParsedCellSqlDialect, index: number): string {
	return dialect === "postgres" ? `$${index}` : "?";
}

function jsonField(dialect: ParsedCellSqlDialect, field: string): string {
	if (dialect === "postgres") {
		return `shared.data::jsonb ->> '${field}'`;
	}
	if (dialect === "duckdb") {
		return `json_extract_string(shared.data, '$.${field}')`;
	}
	return `json_extract(shared.data, '$.${field}')`;
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

function appendEquals(
	dialect: ParsedCellSqlDialect,
	clauses: string[],
	params: unknown[],
	field: string,
	value: unknown,
): void {
	if (value === undefined || value === null) return;
	const idx = params.length + 1;
	clauses.push(`${jsonField(dialect, field)} = ${placeholder(dialect, idx)}`);
	params.push(value);
}

export function compileParsedCellObservationHistoryQuery(
	plan: ParsedCellHistoryPlan,
	dialect: ParsedCellSqlDialect = "sqlite",
): ParsedCellHistoryQuery {
	const { key, tableName, detailTableName } = plan;
	const clauses: string[] = [
		`${jsonField(dialect, "targetSchema")} = ${placeholder(dialect, 1)}`,
		`${jsonField(dialect, "tag")} = ${placeholder(dialect, 2)}`,
	];
	const params: unknown[] = [key.targetSchema, key.tag];

	if (plan.scope === "scoped") {
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
	}

	const rawIndex = params.length + 1;
	const normalizedIndex = params.length + 2;
	clauses.push(
		`(${jsonField(dialect, "rawText")} = ${placeholder(dialect, rawIndex)} OR ${jsonField(dialect, "normalizedText")} = ${placeholder(dialect, normalizedIndex)})`,
	);
	params.push(key.rawText, key.rawText);

	const joinCondition =
		dialect === "postgres"
			? `${detailJsonField(dialect, "cellId")} = shared.data::jsonb ->> 'cellId'`
			: `${detailJsonField(dialect, "cellId")} = ${jsonField(dialect, "cellId")}`;

	return {
		sql: `
			SELECT detail.data AS detail_data, ${scoreExpression(dialect)} AS ranking_score
			FROM ${tableName} AS shared
			JOIN ${detailTableName} AS detail
				ON ${joinCondition}
			WHERE ${clauses.join(" AND ")}
			ORDER BY ranking_score DESC
			${plan.limit ? `LIMIT ${Math.max(1, Math.floor(plan.limit))}` : ""}
		`,
		params,
	};
}
