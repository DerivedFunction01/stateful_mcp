import type { ParsedCellHistoryKey } from "../parsed-cell-store";

export interface ParsedCellHistoryQuery {
	sql: string;
	params: unknown[];
}

function jsonField(field: string): string {
	return `json_extract(data, '$.${field}')`;
}

function appendEquals(
	clauses: string[],
	params: unknown[],
	field: string,
	value: unknown,
): void {
	if (value === undefined || value === null) return;
	clauses.push(`${jsonField(field)} = ?`);
	params.push(value);
}

export function compileParsedCellObservationHistoryQuery(
	key: ParsedCellHistoryKey,
	tableName = "parsed_cell_v1_shared",
): ParsedCellHistoryQuery {
	const clauses: string[] = [
		`${jsonField("targetSchema")} = ?`,
		`${jsonField("tag")} = ?`,
	];
	const params: unknown[] = [key.targetSchema, key.tag];

	appendEquals(clauses, params, "patientId", key.patientId);
	appendEquals(clauses, params, "patientOrganismType", key.patientOrganismType);
	appendEquals(clauses, params, "patientGender", key.patientGender);
	appendEquals(clauses, params, "patientAgeBucket", key.patientAgeBucket);
	appendEquals(
		clauses,
		params,
		"patientSpeciesBucket",
		key.patientSpeciesBucket,
	);
	appendEquals(clauses, params, "patientSubBucket", key.patientSubBucket);
	appendEquals(clauses, params, "patientBucketKey", key.patientBucketKey);
	appendEquals(clauses, params, "personnelId", key.personnelId);
	appendEquals(clauses, params, "specialtyId", key.specialtyId);
	appendEquals(clauses, params, "facilityId", key.facilityId);

	clauses.push(
		`(json_extract(data, '$.rawText') = ? OR json_extract(data, '$.normalizedText') = ?)`,
	);
	params.push(key.rawText, key.rawText);

	return {
		sql: `SELECT data FROM ${tableName} WHERE ${clauses.join(" AND ")}`,
		params,
	};
}
