import { describe, expect, test } from "bun:test";
import { SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import { SqlAutocompleteTransitionStore } from "../../src/store/learning/autocomplete/sql-autocomplete-transition-store";
import type { AutocompleteTransitionInsertPlan } from "../../src/store/learning/interfaces";

function makePlan(
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

describe("SqlAutocompleteTransitionStore", () => {
	test("should create table and indexes on construction", async () => {
		const store = new SqlAutocompleteTransitionStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);
		expect(store).toBeDefined();
	});

	test("should increment selectionCount on repeated inserts", async () => {
		const store = new SqlAutocompleteTransitionStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);
		const plan = makePlan();
		await store.increment(plan);
		await store.increment(plan);

		const records = await store.getByFromSlot({
			personnelId: plan.personnelId,
			templateId: plan.templateId,
			fromSlot: plan.fromSlot,
			toSlot: plan.toSlot,
			featureKey: plan.featureKey,
		});
		expect(records).toHaveLength(1);
		expect(records[0]!.selectionCount).toBe(2);
	});

	test("should filter getByFromSlot by personnelId and templateId", async () => {
		const store = new SqlAutocompleteTransitionStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);
		await store.increment(makePlan({ personnelId: "dr_a" }));
		await store.increment(makePlan({ personnelId: "dr_b" }));

		const results = await store.getByFromSlot({
			personnelId: "dr_a",
			templateId: "tpl_hpi_pain",
			fromSlot: "symptom",
			toSlot: "radiation",
			featureKey: "concept",
		});
		expect(results).toHaveLength(1);
		expect(results[0]!.personnelId).toBe("dr_a");
	});

	test("should return empty when no transitions match", async () => {
		const store = new SqlAutocompleteTransitionStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);
		const results = await store.getByFromSlot({
			personnelId: "nobody",
			templateId: "none",
			fromSlot: "x",
			toSlot: "y",
			featureKey: "z",
		});
		expect(results).toHaveLength(0);
	});

	test("should compute decayed aggregate", async () => {
		const store = new SqlAutocompleteTransitionStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);
		const oldDate = new Date(Date.now() - 60 * 86_400_000).toISOString();
		await store.increment(
			makePlan({
				toSlot: "radiation",
				lastUpdatedAt: oldDate,
				featureValue: "SNOMED::423341008",
			}),
		);
		await store.increment(
			makePlan({ toSlot: "radiation", featureValue: "SNOMED::423341008" }),
		);
		await store.increment(
			makePlan({ toSlot: "duration", featureValue: "duration" }),
		);

		const aggregate = await store.getDecayedAggregate({
			table: "autocomplete_transitions",
			personnelId: "dr_smith",
			templateId: "tpl_hpi_pain",
			fromSlot: "symptom",
			halfLifeDays: 30,
		});

		expect(aggregate.radiation).toBeGreaterThan(aggregate.duration ?? 0);
	});

	test("should compute continuous aggregate for numerical values", async () => {
		const store = new SqlAutocompleteTransitionStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);
		await store.increment(
			makePlan({
				toSlot: "radiation1",
				featureKey: "temperature",
				numericalValue: 38.0,
				featureValue: null,
			}),
		);
		await store.increment(
			makePlan({
				toSlot: "radiation2",
				featureKey: "temperature",
				numericalValue: 39.0,
				featureValue: null,
			}),
		);
		await store.increment(
			makePlan({
				toSlot: "radiation3",
				featureKey: "temperature",
				numericalValue: 40.0,
				featureValue: null,
			}),
		);

		const agg = await store.getContinuousAggregate({
			table: "autocomplete_transitions",
			personnelId: "dr_smith",
			templateId: "tpl_hpi_pain",
			fromSlot: "symptom",
			featureKey: "temperature",
		});

		expect(agg.radiation1).toBeDefined();
		expect(agg.radiation1!.mu).toBe(38.0);

		expect(agg.radiation2).toBeDefined();
		expect(agg.radiation2!.mu).toBe(39.0);

		expect(agg.radiation3).toBeDefined();
		expect(agg.radiation3!.mu).toBe(40.0);
	});
});
