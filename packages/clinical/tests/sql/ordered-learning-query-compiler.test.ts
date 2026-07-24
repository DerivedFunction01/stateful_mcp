import { describe, expect, test } from "bun:test";
import type { OrderedLearningHistoryKey } from "../../src/store/ordered-learning-store";
import {
	compileOrderedLearningCorrectionQuery,
	compileOrderedLearningHistoryQuery,
	compileOrderedLearningInsertQuery,
	getOrderedLearningIndexDDL,
	getOrderedLearningTableDDL,
	type OrderedLearningCorrectionPlan,
	type OrderedLearningInsertPlan,
} from "../../src/store/sql/ordered-learning-query-compiler";

const TEST_TABLE = "ordered_learning_records";

const sampleKey: OrderedLearningHistoryKey = {
	tag: "pain",
	targetSchema: "ObservationEvent",
	rawText: "severe pain in left knee",
	patientId: "pat_001",
	personnelId: "dr_smith",
	specialtyId: "ortho",
};

const sampleInsertPlan: OrderedLearningInsertPlan = {
	table: TEST_TABLE,
	cellId: "cell_001",
	soapNoteId: "note_001",
	tag: "pain",
	targetSchema: "ObservationEvent",
	rawText: "severe pain in left knee",
	patientId: "pat_001",
	patientOrganismType: "human",
	patientGender: "male",
	patientAgeBucket: "adult",
	patientSpeciesBucket: null,
	patientSubBucket: null,
	patientBucketKey: "human_male_adult",
	personnelId: "dr_smith",
	specialtyId: "ortho",
	facilityId: null,
	orderedTokensJson: JSON.stringify([
		{ kind: "tag", key: "pain", index: 0 },
		{ kind: "concept", key: "22253000", value: "Pain", index: 1 },
	]),
	relationsJson: JSON.stringify([
		{
			cellId: "cell_001",
			fromKey: "pain",
			toKey: "22253000",
			fromKind: "tag",
			toKind: "concept",
			relationType: "before",
			tokenGap: 1,
			normalizedGap: 0.5,
		},
	]),
	parsedItemJson: JSON.stringify({
		tag: "pain",
		targetSchema: "ObservationEvent",
	}),
	priorAcceptCount: 1,
	priorCorrectionCount: 0,
	lastAcceptedAt: "2026-07-24T12:00:00Z",
	lastCorrectedAt: null,
	recencyScore: 0.95,
	contractValid: 1,
	stalePreference: 0,
	reviewRequired: 0,
};

const sampleCorrectionPlan: OrderedLearningCorrectionPlan = {
	table: TEST_TABLE,
	cellId: "cell_001",
	priorCorrectionCount: 1,
	lastCorrectedAt: "2026-07-24T12:30:00Z",
	recencyScore: 0.5,
	parsedItemJson: null,
};

describe("compileOrderedLearningHistoryQuery", () => {
	test("produces valid SQL for sqlite", () => {
		const result = compileOrderedLearningHistoryQuery(
			{ table: TEST_TABLE, key: sampleKey },
			"sqlite",
		);
		expect(result.sql).toContain("SELECT * FROM ordered_learning_records");
		expect(result.sql).toContain("WHERE");
		expect(result.sql).toContain("ORDER BY recencyScore DESC");
		expect(result.params.length).toBeGreaterThan(0);
	});

	test("uses ? placeholders for sqlite", () => {
		const result = compileOrderedLearningHistoryQuery(
			{ table: TEST_TABLE, key: sampleKey },
			"sqlite",
		);
		const questionMarks = (result.sql.match(/\?/g) || []).length;
		expect(questionMarks).toBe(result.params.length);
	});

	test("uses $N placeholders for postgres", () => {
		const result = compileOrderedLearningHistoryQuery(
			{ table: TEST_TABLE, key: sampleKey },
			"postgres",
		);
		expect(result.sql).toContain("$1");
		expect(result.sql).not.toContain("?");
	});

	test("uses ? placeholders for duckdb", () => {
		const result = compileOrderedLearningHistoryQuery(
			{ table: TEST_TABLE, key: sampleKey },
			"duckdb",
		);
		const questionMarks = (result.sql.match(/\?/g) || []).length;
		expect(questionMarks).toBe(result.params.length);
	});

	test("includes tag, targetSchema, rawText in WHERE clause", () => {
		const result = compileOrderedLearningHistoryQuery(
			{ table: TEST_TABLE, key: sampleKey },
			"sqlite",
		);
		expect(result.sql).toContain("tag = ?");
		expect(result.sql).toContain("targetSchema = ?");
		expect(result.sql).toContain("rawText = ?");
	});

	test("includes optional scoping fields when provided", () => {
		const result = compileOrderedLearningHistoryQuery(
			{ table: TEST_TABLE, key: sampleKey },
			"sqlite",
		);
		expect(result.sql).toContain("patientId = ?");
		expect(result.sql).toContain("personnelId = ?");
		expect(result.sql).toContain("specialtyId = ?");
	});

	test("omits optional scoping fields when not provided", () => {
		const minimalKey: OrderedLearningHistoryKey = {
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "pain",
		};
		const result = compileOrderedLearningHistoryQuery(
			{ table: TEST_TABLE, key: minimalKey },
			"sqlite",
		);
		expect(result.sql).not.toContain("patientId");
		expect(result.sql).not.toContain("personnelId");
		expect(result.params.length).toBe(3); // tag, targetSchema, rawText
	});
});

describe("compileOrderedLearningInsertQuery", () => {
	test("produces INSERT OR REPLACE for sqlite", () => {
		const result = compileOrderedLearningInsertQuery(
			sampleInsertPlan,
			"sqlite",
		);
		expect(result.sql).toContain("INSERT OR REPLACE INTO");
		expect(result.sql).toContain("ordered_learning_records");
	});

	test("produces INSERT ... ON CONFLICT for postgres", () => {
		const result = compileOrderedLearningInsertQuery(
			sampleInsertPlan,
			"postgres",
		);
		expect(result.sql).toContain("INSERT INTO");
		expect(result.sql).toContain("ON CONFLICT (cellId) DO UPDATE SET");
	});

	test("produces INSERT OR REPLACE for duckdb", () => {
		const result = compileOrderedLearningInsertQuery(
			sampleInsertPlan,
			"duckdb",
		);
		expect(result.sql).toContain("INSERT OR REPLACE INTO");
	});

	test("includes all 26 columns", () => {
		const result = compileOrderedLearningInsertQuery(
			sampleInsertPlan,
			"sqlite",
		);
		const colCount =
			(result.sql.match(/\w+Id/g) || []).length +
			(result.sql.match(/patient\w+/g) || []).length +
			(
				result.sql.match(
					/recencyScore|contractValid|stalePreference|reviewRequired/g,
				) || []
			).length;
		expect(result.params.length).toBe(26);
	});

	test("uses $N placeholders for postgres", () => {
		const result = compileOrderedLearningInsertQuery(
			sampleInsertPlan,
			"postgres",
		);
		expect(result.sql).toContain("$1");
		expect(result.sql).toContain("$26");
	});
});

describe("compileOrderedLearningCorrectionQuery", () => {
	test("produces UPDATE for sqlite", () => {
		const result = compileOrderedLearningCorrectionQuery(
			sampleCorrectionPlan,
			"sqlite",
		);
		expect(result.sql).toContain("UPDATE");
		expect(result.sql).toContain("SET");
		expect(result.sql).toContain("WHERE cellId = ?");
	});

	test("sets stalePreference=1 and reviewRequired=0 when no replacement", () => {
		const result = compileOrderedLearningCorrectionQuery(
			sampleCorrectionPlan,
			"sqlite",
		);
		expect(result.sql).toContain("stalePreference = 1");
		expect(result.sql).toContain("reviewRequired = 0");
	});

	test("sets reviewRequired=1 when replacement is provided", () => {
		const planWithReplacement: OrderedLearningCorrectionPlan = {
			...sampleCorrectionPlan,
			parsedItemJson: JSON.stringify({ tag: "ache" }),
		};
		const result = compileOrderedLearningCorrectionQuery(
			planWithReplacement,
			"sqlite",
		);
		expect(result.sql).toContain("reviewRequired = 1");
		expect(result.sql).toContain("parsedItem = ?");
	});

	test("uses $N placeholders for postgres", () => {
		const result = compileOrderedLearningCorrectionQuery(
			sampleCorrectionPlan,
			"postgres",
		);
		expect(result.sql).toContain("$1");
		expect(result.sql).not.toContain("?");
	});
});

describe("getOrderedLearningTableDDL", () => {
	test("produces CREATE TABLE IF NOT EXISTS", () => {
		const ddl = getOrderedLearningTableDDL(TEST_TABLE);
		expect(ddl).toContain("CREATE TABLE IF NOT EXISTS");
		expect(ddl).toContain("ordered_learning_records");
		expect(ddl).toContain("cellId TEXT PRIMARY KEY");
		expect(ddl).toContain("orderedTokens TEXT NOT NULL DEFAULT '[]'");
		expect(ddl).toContain("relations TEXT NOT NULL DEFAULT '[]'");
		expect(ddl).toContain("recencyScore REAL NOT NULL DEFAULT 0");
	});
});

describe("getOrderedLearningIndexDDL", () => {
	test("returns three index statements", () => {
		const indexes = getOrderedLearningIndexDDL(TEST_TABLE);
		expect(indexes.length).toBe(3);
		expect(indexes[0]).toContain("CREATE INDEX IF NOT EXISTS");
		expect(indexes[0]).toContain("patientId");
		expect(indexes[1]).toContain("personnelId");
		expect(indexes[2]).toContain("recencyScore");
	});
});
