import { describe, expect, it } from "bun:test";
import { MemoryKvBackend, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import { KvMacroTransitionStore } from "../src/learning/autocomplete/kv-transition-store";
import { SqlMacroTransitionStore } from "../src/learning/autocomplete/sql-transition-store";
import type {
	MacroTransitionObservation,
	MacroTransitionStore,
} from "../src/learning/interfaces";
import {
	KvBackendSystemWeightStore,
	SqlBackendSystemWeightStore,
} from "../src/learning/weight-store";

const baseObservation: MacroTransitionObservation = {
	macroId: "macro.exam",
	macroVersion: 1,
	fromSlot: "START",
	toSlot: "height",
	featureKey: "measurement.value",
	featureValue: "m",
	scope: "global",
	scopeKey: "all",
	observationMode: "execution",
	outcome: "positive",
};

async function exercise(store: MacroTransitionStore): Promise<void> {
	await store.increment({
		...baseObservation,
		numericalValue: 1.7,
		observationId: "one",
	});
	await store.increment({
		...baseObservation,
		numericalValue: 1.8,
		observationId: "two",
	});
	await store.increment({
		...baseObservation,
		numericalValue: 2,
		observationId: "three",
	});
	await store.increment({
		...baseObservation,
		numericalValue: 2,
		observationId: "three",
	});

	const records = await store.getByFromSlot({
		macroId: "macro.exam",
		macroVersion: 1,
		fromSlot: "START",
		scope: "global",
		scopeKey: "all",
		observationModes: ["execution"],
	});
	const stats = await store.getNumericStatistics({
		macroId: "macro.exam",
		macroVersion: 1,
		fromSlot: "START",
		scope: "global",
		scopeKey: "all",
		observationModes: ["execution"],
		featureKey: "measurement.value",
		featureValue: "m",
		toSlots: ["height"],
	});

	expect(records[0]?.transitionCount).toBe(3);
	expect(stats.height?.count).toBe(3);
	expect(stats.height?.mean).toBeCloseTo(1.8333333333, 8);
	expect(stats.height?.standardDeviationPopulation).toBeCloseTo(
		0.1247219129,
		8,
	);
}

describe("macro transition learning", () => {
	it("aggregates normalized numeric values in KV", async () => {
		await exercise(new KvMacroTransitionStore(new MemoryKvBackend()));
	});

	it("aggregates normalized numeric values in SQLite", async () => {
		const backend = await SqlBackend.connect("sqlite", ":memory:");
		await exercise(
			new SqlMacroTransitionStore("sqlite", new SqlExecutor(backend)),
		);
	});
});

describe("adaptive system weights", () => {
	it("bounds and de-duplicates KV feedback", async () => {
		const store = new KvBackendSystemWeightStore(new MemoryKvBackend());
		await store.applyFeedback({
			category: "macro.rank",
			key: "feature",
			subKey: "numericFit",
			delta: 10,
			signal: "positive",
			correlationId: "feedback-1",
		});
		const repeated = await store.applyFeedback({
			category: "macro.rank",
			key: "feature",
			subKey: "numericFit",
			delta: 10,
			signal: "positive",
			correlationId: "feedback-1",
		});
		expect(repeated).toBe(5);
		expect(await store.getWeight("macro.rank", "feature", "numericFit")).toBe(
			5,
		);
	});

	it("bounds SQL feedback", async () => {
		const backend = await SqlBackend.connect("sqlite", ":memory:");
		const store = new SqlBackendSystemWeightStore(
			"sqlite",
			new SqlExecutor(backend),
		);
		const value = await store.applyFeedback({
			category: "macro.rank",
			key: "feature",
			subKey: "numericFit",
			delta: -10,
			signal: "negative",
			correlationId: "feedback-2",
		});
		expect(value).toBe(0.1);
	});
});
