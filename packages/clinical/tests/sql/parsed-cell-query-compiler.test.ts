import { describe, expect, test } from "bun:test";
import {
	compileParsedCellObservationHistoryQuery,
	type ParsedCellSqlDialect,
} from "../../src/store/sql/parsed-cell-query-compiler";

const baseKey = {
	tag: "#observation",
	targetSchema: "ObservationEvent",
	rawText: "#observation shortness of breath",
	patientId: "patient-1",
	patientOrganismType: "human",
	patientGender: "female",
	patientAgeBucket: "30-39",
	patientSpeciesBucket: "human",
	patientSubBucket: 0,
	patientBucketKey: "patient-1|human|female|30-39|0",
	personnelId: "personnel-1",
	specialtyId: "cardiology",
	facilityId: "facility-1",
};

function makePlan(dialect: ParsedCellSqlDialect) {
	return {
		tableName: "parsed_cell_v1_shared",
		detailTableName: "parsed_cell_v1_observation_detail",
		key: baseKey,
		scope: "scoped" as const,
		limit: 50,
		dialect,
	};
}

describe("ParsedCellSqlDialect", () => {
	test("compileParsedCellObservationHistoryQuery produces valid SQL for sqlite", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		expect(result.sql).toContain("SELECT");
		expect(result.sql).toContain("FROM");
		expect(result.sql).toContain("WHERE");
		expect(result.sql).toContain("ORDER BY");
		expect(result.sql).toContain("LIMIT");
		expect(result.params).toHaveLength(14);
	});

	test("compileParsedCellObservationHistoryQuery produces valid SQL for postgres", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("postgres"),
			"postgres",
		);
		expect(result.sql).toContain("SELECT");
		expect(result.sql).toContain("FROM");
		expect(result.sql).toContain("WHERE");
		expect(result.sql).toContain("ORDER BY");
		expect(result.sql).toContain("LIMIT");
		expect(result.params).toHaveLength(14);
	});

	test("compileParsedCellObservationHistoryQuery produces valid SQL for duckdb", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("duckdb"),
			"duckdb",
		);
		expect(result.sql).toContain("SELECT");
		expect(result.sql).toContain("FROM");
		expect(result.sql).toContain("WHERE");
		expect(result.sql).toContain("ORDER BY");
		expect(result.sql).toContain("LIMIT");
		expect(result.params).toHaveLength(14);
	});

	test("sqlite uses ? placeholders not $N postgres placeholders", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		expect(result.sql).toContain("?");
		expect(result.sql).not.toContain("$1");
	});

	test("postgres uses $N placeholders", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("postgres"),
			"postgres",
		);
		expect(result.sql).toContain("$1");
		expect(result.sql).toContain("$2");
		expect(result.sql).not.toContain("?");
	});

	test("duckdb uses ? placeholders not $N postgres placeholders", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("duckdb"),
			"duckdb",
		);
		expect(result.sql).toContain("?");
		expect(result.sql).not.toContain("$1");
	});
});

describe("ParsedCellHistoryPlan scope", () => {
	test("scoped plan includes patient fields in WHERE clause", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		expect(result.sql).toContain("patientId");
		expect(result.sql).toContain("personnelId");
		expect(result.sql).toContain("specialtyId");
		expect(result.sql).toContain("facilityId");
	});

	test("global plan excludes patient fields from WHERE clause", () => {
		const result = compileParsedCellObservationHistoryQuery(
			{
				...makePlan("sqlite"),
				scope: "global" as const,
			},
			"sqlite",
		);
		expect(result.sql).not.toContain("patientId");
		expect(result.sql).not.toContain("personnelId");
		expect(result.sql).not.toContain("specialtyId");
		expect(result.sql).not.toContain("facilityId");
	});

	test("global plan has fewer params than scoped plan", () => {
		const scoped = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		const global = compileParsedCellObservationHistoryQuery(
			{
				...makePlan("sqlite"),
				scope: "global" as const,
			},
			"sqlite",
		);
		expect(global.params.length).toBeLessThan(scoped.params.length);
	});
});

describe("ParsedCellHistoryQuery ordering", () => {
	test("results are ordered by ranking_score DESC", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		expect(result.sql).toContain("ORDER BY ranking_score DESC");
	});

	test("limit is applied when specified", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		expect(result.sql).toContain("LIMIT 50");
	});

	test("negative limit is clamped to 1", () => {
		const result = compileParsedCellObservationHistoryQuery(
			{
				...makePlan("sqlite"),
				limit: -5,
			},
			"sqlite",
		);
		expect(result.sql).toContain("LIMIT 1");
	});
});

describe("ParsedCellHistoryQuery parameter binding", () => {
	test("params are bound in the correct order for sqlite", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		expect(result.params[0]).toBe("ObservationEvent");
		expect(result.params[1]).toBe("#observation");
		expect(result.params[2]).toBe("patient-1");
		expect(result.params[3]).toBe("human");
		expect(result.params[4]).toBe("female");
		expect(result.params[5]).toBe("30-39");
		expect(result.params[6]).toBe("human");
		expect(result.params[7]).toBe(0);
		expect(result.params[8]).toBe("patient-1|human|female|30-39|0");
		expect(result.params[9]).toBe("personnel-1");
		expect(result.params[10]).toBe("cardiology");
		expect(result.params[11]).toBe("facility-1");
		expect(result.params[12]).toBe("#observation shortness of breath");
		expect(result.params[13]).toBe("#observation shortness of breath");
	});

	test("rawText is bound twice for OR match on rawText and normalizedText", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		const rawTextParams = result.params.filter(
			(p) => p === "#observation shortness of breath",
		);
		expect(rawTextParams).toHaveLength(2);
	});
});

describe("ParsedCellHistoryQuery dialect-specific JSON extraction", () => {
	test("sqlite uses json_extract", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		expect(result.sql).toContain("json_extract");
	});

	test("postgres uses jsonb ->> operator", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("postgres"),
			"postgres",
		);
		expect(result.sql).toContain("->>");
	});

	test("duckdb uses json_extract_string", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("duckdb"),
			"duckdb",
		);
		expect(result.sql).toContain("json_extract_string");
	});
});

describe("ParsedCellHistoryQuery ranking score expression", () => {
	test("ranking score includes recency, accept count, contract valid, and correction count", () => {
		const result = compileParsedCellObservationHistoryQuery(
			makePlan("sqlite"),
			"sqlite",
		);
		expect(result.sql).toContain("recencyScore");
		expect(result.sql).toContain("priorAcceptCount");
		expect(result.sql).toContain("contractValid");
		expect(result.sql).toContain("priorCorrectionCount");
	});
});
