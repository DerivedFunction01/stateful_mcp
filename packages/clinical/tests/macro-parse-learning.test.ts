import { describe, expect, it } from "bun:test";
import { SqlMacroParseLearningStore, type MacroParseLearningStore } from "../src/learning/macro-parse-learning-store";
import { KvMacroParseLearningStore } from "../src/learning/kv-macro-parse-learning-store";
import { MacroCompiler } from "../src/macros/macro-compiler";
import type { MacroDefinition } from "../src/macros/macro-definition";
import { createDefaultSchemaRegistry } from "../src/schemas/default-registry";
import { SqlBackend, SqlExecutor, MemoryKvBackend } from "@stateful-mcp/core";

async function makeSqlStore(maxHistoryRows?: number, pruneBatchSize?: number): Promise<{ store: MacroParseLearningStore; executor: SqlExecutor }> {
	const backend = await SqlBackend.connect("sqlite", ":memory:");
	const executor = new SqlExecutor(backend);
	const store = new SqlMacroParseLearningStore(
		"sqlite",
		executor,
		maxHistoryRows !== undefined && pruneBatchSize !== undefined
			? { maxHistoryRows, pruneBatchSize }
			: undefined
	);
	return { store, executor };
}

function makeKvStore(maxHistoryRows?: number, pruneBatchSize?: number): MacroParseLearningStore {
	return new KvMacroParseLearningStore(
		new MemoryKvBackend(),
		maxHistoryRows !== undefined && pruneBatchSize !== undefined
			? { maxHistoryRows, pruneBatchSize }
			: undefined
	);
}

describe("macro parse feedback learning store", () => {
	it("SqlMacroParseLearningStore: records, updates aggregates, and prunes", async () => {
		const { store, executor } = await makeSqlStore(2, 1);

		// Record 2 feedbacks
		await store.recordFeedback({
			macroId: "onset_macro",
			macroVersion: 1,
			argumentName: "onset",
			argumentKind: "temporal",
			rawTerm: "2hr",
			parsedValue: '{"value":2,"unit":"h"}',
			correctedValue: null,
			outcome: "accepted"
		});

		await store.recordFeedback({
			macroId: "onset_macro",
			macroVersion: 1,
			argumentName: "onset",
			argumentKind: "temporal",
			rawTerm: "2hr",
			parsedValue: '{"value":2,"unit":"h"}',
			correctedValue: null,
			outcome: "accepted"
		});

		let rawCount = await executor.query("SELECT COUNT(*) as count FROM macro_parse_events", []);
		expect(Number(rawCount[0].count)).toBe(2);

		// Record 3rd -> triggers prune
		await store.recordFeedback({
			macroId: "onset_macro",
			macroVersion: 1,
			argumentName: "onset",
			argumentKind: "temporal",
			rawTerm: "2hr",
			parsedValue: '{"value":2,"unit":"h"}',
			correctedValue: "3hr",
			outcome: "corrected"
		});

		rawCount = await executor.query("SELECT COUNT(*) as count FROM macro_parse_events", []);
		expect(Number(rawCount[0].count)).toBe(2);

		const aggregates = await executor.query("SELECT accepted_count, corrected_count FROM macro_parse_aggregates", []);
		expect(aggregates).toHaveLength(1);
		expect(Number(aggregates[0].accepted_count)).toBe(1);
		expect(Number(aggregates[0].corrected_count)).toBe(0);

		const confidence = await store.getConfidence("onset_macro", "onset", "2hr", '{"value":2,"unit":"h"}');
		expect(confidence.sampleSize).toBe(3);
		expect(confidence.score).toBe((2 + 1) / (3 + 2));
	});

	it("KvMacroParseLearningStore: records, updates aggregates, and prunes", async () => {
		const store = makeKvStore(2, 1);

		// Record 2 feedbacks
		await store.recordFeedback({
			macroId: "onset_macro",
			macroVersion: 1,
			argumentName: "onset",
			argumentKind: "temporal",
			rawTerm: "2hr",
			parsedValue: '{"value":2,"unit":"h"}',
			correctedValue: null,
			outcome: "accepted"
		});

		await store.recordFeedback({
			macroId: "onset_macro",
			macroVersion: 1,
			argumentName: "onset",
			argumentKind: "temporal",
			rawTerm: "2hr",
			parsedValue: '{"value":2,"unit":"h"}',
			correctedValue: null,
			outcome: "accepted"
		});

		let confidence = await store.getConfidence("onset_macro", "onset", "2hr", '{"value":2,"unit":"h"}');
		expect(confidence.sampleSize).toBe(2);
		expect(confidence.score).toBe((2 + 1) / (2 + 2));

		// Record 3rd -> triggers prune
		await store.recordFeedback({
			macroId: "onset_macro",
			macroVersion: 1,
			argumentName: "onset",
			argumentKind: "temporal",
			rawTerm: "2hr",
			parsedValue: '{"value":2,"unit":"h"}',
			correctedValue: "3hr",
			outcome: "corrected"
		});

		confidence = await store.getConfidence("onset_macro", "onset", "2hr", '{"value":2,"unit":"h"}');
		expect(confidence.sampleSize).toBe(3);
		expect(confidence.score).toBe((2 + 1) / (3 + 2));
	});

	it("integrates confidence lookup inside MacroCompiler", async () => {
		const { store } = await makeSqlStore();

		await store.recordFeedback({
			macroId: "onset_macro",
			macroVersion: 1,
			argumentName: "onset",
			argumentKind: "temporal",
			rawTerm: "2d",
			parsedValue: '{"kind":"temporal","temporalType":"duration","value":"2d","rawText":"2d","evidence":[{"source":"temporal_pattern"}]}',
			correctedValue: null,
			outcome: "accepted"
		});

		const registry = createDefaultSchemaRegistry();
		const compiler = new MacroCompiler({
			registry,
			macroParseStore: store
		});

		const definition: MacroDefinition = {
			macroId: "onset_macro",
			macroName: "onset",
			version: 1,
			status: "published",
			active: true,
			root: {
				roleName: "observation",
				targetSchema: "Observation",
				outputCellKind: "structured",
			},
			arguments: [
				{
					argumentId: "onset",
					name: "Onset",
					roleName: "onset",
					position: 0,
					extraction: {
						kind: "temporal",
						temporalType: "duration",
					},
					target: {
						targetSchema: "Observation",
						targetPath: "duration"
					}
				}
			]
		};

		const result = await compiler.compile(
			{
				macroName: "onset",
				sourceLines: [{ line: 1, raw: "onset 2d" }],
				arguments: [{ rawValue: "2d", source: "positional", position: 0, start: 6, end: 8 }]
			},
			definition
		);



		expect(result.confidence).toBeDefined();
		expect(result.confidence?.onset).toBeDefined();
		expect(result.confidence?.onset?.sampleSize).toBe(1);
		expect(result.confidence?.onset?.score).toBe((1 + 1) / (1 + 2));
	});
});
