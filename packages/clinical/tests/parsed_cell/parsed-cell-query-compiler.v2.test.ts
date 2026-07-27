import { describe, expect, test } from "bun:test";
import { CANONICAL_TAGS } from "../../src/parser/schema-parsers.v2";
import {
	type ParsedCellRecordTransform,
	registerTransform,
} from "../../src/store/learning/parsed_cell/parsed-cell-record-transform";
import { flattenParsedItem } from "../../src/store/learning/parsed_cell/transforms/flatten-helper";
import {
	autoIndexName,
	ParsedCellSqlCompilerV2,
	resolveDetailTable,
} from "../../src/store/sql/parsed-cell-query-compiler.v2";

const observationTransform: ParsedCellRecordTransform = {
	targetSchema: CANONICAL_TAGS.OBSERVATION,
	template(): import("../../src/parser/schema-parsers.v2").ParsedItem {
		return {
			targetSchema: CANONICAL_TAGS.OBSERVATION,
			attributes: {},
			concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
			rawText: "temperature 101F",
			tag: CANONICAL_TAGS.OBSERVATION,
			extractedData: {
				certainty: "confirmed",
				status: "present",
				severity: { score: 3, maxScore: 5, normalizedScore: 0.6 },
				duration: {
					magnitude: 2,
					unit: "days",
					operator: "eq",
					is_approximate: false,
				},
				trajectory: "worsening",
			},
		};
	},
	flatten(parsedItem) {
		const flat = flattenParsedItem(parsedItem as any);
		delete flat.id;
		delete flat.rawTerm;
		delete flat.dateRange;
		return flat;
	},
	indexes: [
		{ columns: ["recencyScore"] },
		{ columns: ["conceptId", "targetSchema"], unique: false },
	],
};

describe("ParsedCellSqlCompilerV2", () => {
	const compiler = new ParsedCellSqlCompilerV2("sqlite");
	const detailTable = "parsed_cell_observation_detail";

	test("resolveDetailTable returns schema-specific table name", () => {
		expect(resolveDetailTable("ObservationEvent")).toBe(
			"parsed_cell_observation_detail",
		);
		expect(resolveDetailTable("VitalsMeasurementEvent")).toBe(
			"parsed_cell_vitals_detail",
		);
		expect(resolveDetailTable("UnknownSchema")).toBe(
			"parsed_cell_unknownschema_detail",
		);
	});

	test("autoIndexName generates deterministic name", () => {
		expect(
			autoIndexName("parsed_cell_observation_detail", ["recencyScore"]),
		).toBe("idx_parsed_cell_observation_detail_recencyScore");
	});

	test("compileCreateDetailTable emits DDL with flat columns + scoring defaults", () => {
		registerTransform(observationTransform);
		const result = compiler.compileCreateDetailTable(
			detailTable,
			observationTransform,
		);
		expect(result.sql).toContain("CREATE TABLE IF NOT EXISTS");
		expect(result.sql).toContain(`"${detailTable}"`);
		expect(result.sql).toContain(`"cellId" TEXT PRIMARY KEY`);
		expect(result.sql).toContain(`"recencyScore" REAL NOT NULL DEFAULT 0`);
		expect(result.sql).toContain(
			`"priorAcceptCount" INTEGER NOT NULL DEFAULT 0`,
		);
		expect(result.sql).toContain(
			`"priorCorrectionCount" INTEGER NOT NULL DEFAULT 0`,
		);
		expect(result.sql).toContain(`"contractValid" INTEGER NOT NULL DEFAULT 1`);
		expect(result.sql).toContain(
			`"stalePreference" INTEGER NOT NULL DEFAULT 0`,
		);
		expect(result.sql).toContain(`"reviewRequired" INTEGER NOT NULL DEFAULT 0`);
		expect(result.sql).toContain(`"conceptId" TEXT`);
		expect(result.sql).toContain(`"certainty" TEXT`);
		expect(result.sql).toContain(`"severity.score"`);
	});

	test("compileCreateIndexes emits index DDL from transform", () => {
		const results = compiler.compileCreateIndexes(
			detailTable,
			observationTransform.indexes,
		);
		expect(results).toHaveLength(2);
		expect(results[0]!.sql).toContain(`idx_${detailTable}_recencyScore`);
		expect(results[0]!.sql).toContain(`"recencyScore"`);
		expect(results[1]!.sql).toContain(
			`idx_${detailTable}_conceptId_targetSchema`,
		);
		expect(results[1]!.sql).toContain(`"conceptId"`);
		expect(results[1]!.sql).toContain(`"targetSchema"`);
	});

	test("compileDetailInsert emits INSERT with all columns", () => {
		const flatValues = flattenParsedItem({
			targetSchema: CANONICAL_TAGS.OBSERVATION,
			attributes: {},
			concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
			rawText: "temperature 101F",
			tag: CANONICAL_TAGS.OBSERVATION,
			extractedData: { certainty: "confirmed", status: "present" },
		});

		const result = compiler.compileDetailInsert(
			detailTable,
			observationTransform,
			{
				cellId: "cell-1",
				...flatValues,
				recencyScore: 0,
				priorAcceptCount: 0,
				priorCorrectionCount: 0,
				contractValid: 1,
				stalePreference: 0,
				reviewRequired: 0,
			},
		);

		expect(result.sql).toContain(`INSERT OR REPLACE INTO`);
		expect(result.sql).toContain(`"cellId"`);
		expect(result.sql).toContain(`"conceptId"`);
		expect(result.sql).toContain(`"recencyScore"`);
		expect(result.params).toContain("cell-1");
		expect(result.params).toContain("LOINC::8310-5");
	});

	test("compileDetailUpdate emits UPDATE with flat columns", () => {
		const result = compiler.compileDetailUpdate(detailTable, "cell-1", {
			priorCorrectionCount: 1,
			recencyScore: 0.5,
			stalePreference: 1,
		});

		expect(result.sql).toContain(`UPDATE "${detailTable}"`);
		expect(result.sql).toContain(`"priorCorrectionCount"`);
		expect(result.sql).toContain(`"recencyScore"`);
		expect(result.sql).toContain(`("cellId" = ?)`);
		expect(result.params).toEqual([1, 0.5, 1, "cell-1"]);
	});

	test("compileScoringExpression returns flat-column expression with weights", () => {
		const result = compiler.compileScoringExpression();
		expect(result.raw).toContain(`"recencyScore"`);
		expect(result.raw).toContain(`"priorAcceptCount" * :weightAccept`);
		expect(result.raw).toContain(`"priorCorrectionCount" * :weightCorrection`);
		expect(result.raw).toContain(`"contractValid"`);
		expect(result.alias).toBe("ranking_score");
	});

	test("compileHistoryQuery emits JOIN + flat-column scoring + ORDER BY", () => {
		const result = compiler.compileHistoryQuery({
			detailTableName: detailTable,
			sharedTableName: "parsed_cell_shared",
			key: {
				tag: CANONICAL_TAGS.OBSERVATION,
				targetSchema: CANONICAL_TAGS.OBSERVATION,
				rawText: "temperature 101F",
			},
			scope: "global",
			limit: 50,
		});

		expect(result.sql).toContain(`FROM "parsed_cell_shared" AS "shared"`);
		expect(result.sql).toContain(`INNER JOIN "${detailTable}" AS "detail"`);
		expect(result.sql).toContain(`"recencyScore" + ("priorAcceptCount" * 0.2)`);
		expect(result.sql).toContain(`ORDER BY "ranking_score" DESC`);
		expect(result.sql).toContain(`LIMIT 50`);
	});
});
