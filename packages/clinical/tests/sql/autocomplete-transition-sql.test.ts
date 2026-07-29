import { describe, expect, test } from "bun:test";
import type {
	AutocompleteTransitionContinuousAggregatePlan,
	AutocompleteTransitionDecayedAggregatePlan,
	AutocompleteTransitionInsertPlan,
	AutocompleteTransitionKey,
} from "../../src/store/learning/interfaces";
import { AutocompleteTransitionQueryCompiler } from "../../src/store/sql/autocomplete-transition-query-compiler";

function makeInsertPlan(
	overrides?: Partial<AutocompleteTransitionInsertPlan>,
): AutocompleteTransitionInsertPlan {
	const now = new Date().toISOString();
	return {
		table: "autocomplete_transitions",
		personnelId: "dr_smith",
		templateId: "tpl_hpi_pain",
		fromSlot: "symptom",
		toSlot: "radiation",
		featureKey: "concept",
		featureValue: "SNOMED::423341008",
		numericalValue: null,
		selectionCount: 1,
		lastUpdatedAt: now,
		...overrides,
	};
}

describe("AutocompleteTransitionQueryCompiler (sqlite)", () => {
	const compiler = new AutocompleteTransitionQueryCompiler("sqlite");

	test("getTableDDL emits CREATE TABLE with primary key", () => {
		const ddl = compiler.getTableDDL("autocomplete_transitions");
		expect(ddl).toHaveLength(1);
		expect(ddl[0]!.sql).toContain("CREATE TABLE IF NOT EXISTS");
		expect(ddl[0]!.sql).toContain("autocomplete_transitions");
		expect(ddl[0]!.sql).toContain("PRIMARY KEY");
		expect(ddl[0]!.sql).toContain("personnelId");
		expect(ddl[0]!.sql).toContain("templateId");
		expect(ddl[0]!.sql).toContain("fromSlot");
		expect(ddl[0]!.sql).toContain("toSlot");
		expect(ddl[0]!.sql).toContain("featureKey");
		expect(ddl[0]!.sql).toContain("featureValue");
		expect(ddl[0]!.sql).toContain("numericalValue");
		expect(ddl[0]!.sql).toContain("selectionCount");
		expect(ddl[0]!.sql).toContain("lastUpdatedAt");
	});

	test("getIndexDDL emits index on lookup columns", () => {
		const indexes = compiler.getIndexDDL("autocomplete_transitions");
		expect(indexes.length).toBeGreaterThanOrEqual(1);
		const names = indexes.map((idx) => idx.sql);
		expect(
			names.some(
				(sql) =>
					sql.includes("personnelId") &&
					sql.includes("templateId") &&
					sql.includes("fromSlot"),
			),
		).toBe(true);
	});

	test("compileIncrementQuery emits INSERT ... ON CONFLICT DO UPDATE for sqlite", () => {
		const plan = makeInsertPlan();
		const { sql } = compiler.compileIncrementQuery(plan);
		expect(sql).toContain('INSERT INTO "autocomplete_transitions"');
		expect(sql).toContain(
			'ON CONFLICT ("personnelId", "templateId", "fromSlot", "toSlot", "featureKey") DO UPDATE SET',
		);
		expect(sql).toContain(
			'"selectionCount" = ("selectionCount" + "excluded"."selectionCount")',
		);
		expect(sql).toContain('"lastUpdatedAt" = "excluded"."lastUpdatedAt"');
	});

	test("compileGetByFromSlotQuery emits filtered SELECT", () => {
		const key: AutocompleteTransitionKey = {
			personnelId: "dr_smith",
			templateId: "tpl_hpi_pain",
			fromSlot: "symptom",
			toSlot: "radiation",
			featureKey: "concept",
		};
		const { sql, params } = compiler.compileGetByFromSlotQuery(
			key,
			"autocomplete_transitions",
		);
		expect(sql).toContain("SELECT");
		expect(sql).toContain('FROM "autocomplete_transitions"');
		expect(sql).toContain('"personnelId" = ?');
		expect(sql).toContain('"templateId" = ?');
		expect(sql).toContain('"fromSlot" = ?');
		expect(params).toEqual(["dr_smith", "tpl_hpi_pain", "symptom"]);
	});

	test("compileDecayedAggregateQuery emits subquery + decay expression", () => {
		const plan: AutocompleteTransitionDecayedAggregatePlan = {
			table: "autocomplete_transitions",
			personnelId: "dr_smith",
			templateId: "tpl_hpi_pain",
			fromSlot: "symptom",
			halfLifeDays: 30,
		};
		const { sql } = compiler.compileDecayedAggregateQuery(plan);
		expect(sql).toContain("SELECT");
		expect(sql).toContain("toSlot");
		expect(sql).toContain("decayed_total");
		expect(sql).toContain("SUM");
		expect(sql).toContain("POWER");
		expect(sql).toContain("GROUP BY");
		expect(sql).toContain('FROM "autocomplete_transitions" AS "t"');
		expect(sql).toContain("CROSS JOIN");
	});

	test("compileContinuousAggregateQuery emits AVG and inline VAR_SAMP for sqlite", () => {
		const plan: AutocompleteTransitionContinuousAggregatePlan = {
			table: "autocomplete_transitions",
			personnelId: "dr_smith",
			templateId: "tpl_hpi_pain",
			fromSlot: "symptom",
			featureKey: "temperature",
		};
		const { sql } = compiler.compileContinuousAggregateQuery(plan);
		expect(sql).toContain("SELECT");
		expect(sql).toContain('AVG("numericalValue")');
		expect(sql).toContain("CASE WHEN COUNT");
		expect(sql).toContain("GROUP BY");
		expect(sql).toContain('"featureKey" = ?');
	});
});

describe("AutocompleteTransitionQueryCompiler (postgres)", () => {
	const compiler = new AutocompleteTransitionQueryCompiler("postgres");

	test("compileIncrementQuery emits ON CONFLICT ... DO UPDATE SET for postgres", () => {
		const plan = makeInsertPlan();
		const { sql } = compiler.compileIncrementQuery(plan);
		expect(sql).toContain('INSERT INTO "autocomplete_transitions"');
		expect(sql).toContain(
			'ON CONFLICT ("personnelId", "templateId", "fromSlot", "toSlot", "featureKey") DO UPDATE SET',
		);
		expect(sql).toContain(
			'"selectionCount" = ("autocomplete_transitions"."selectionCount" + "EXCLUDED"."selectionCount")',
		);
		expect(sql).toContain('"lastUpdatedAt" = "EXCLUDED"."lastUpdatedAt"');
	});

	test("compileDecayedAggregateQuery uses EXTRACT(EPOCH FROM ...) for postgres", () => {
		const plan: AutocompleteTransitionDecayedAggregatePlan = {
			table: "autocomplete_transitions",
			personnelId: "dr_smith",
			templateId: "tpl_hpi_pain",
			fromSlot: "symptom",
			halfLifeDays: 30,
		};
		const { sql } = compiler.compileDecayedAggregateQuery(plan);
		expect(sql).toContain("EXTRACT(EPOCH FROM");
		expect(sql).toContain("POWER");
	});

	test("compileContinuousAggregateQuery uses postgres VAR_SAMP syntax", () => {
		const plan: AutocompleteTransitionContinuousAggregatePlan = {
			table: "autocomplete_transitions",
			personnelId: "dr_smith",
			templateId: "tpl_hpi_pain",
			fromSlot: "symptom",
			featureKey: "temperature",
		};
		const { sql } = compiler.compileContinuousAggregateQuery(plan);
		expect(sql).toContain('VAR_SAMP("numericalValue")');
		expect(sql).toContain('AVG("numericalValue")');
		expect(sql).toContain("GROUP BY");
	});
});
