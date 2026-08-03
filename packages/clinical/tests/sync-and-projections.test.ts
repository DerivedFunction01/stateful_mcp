import { describe, expect, it } from "bun:test";
import type { ClinicalDocumentReadModel } from "../src/clinical/clinical-document-types";
import { ProjectionRegistry } from "../src/projections/projection-registry";
import { SyncEngine } from "../src/sync/sync-engine";
import type { SyncConfig } from "../src/sync/sync-rule-config";
import { evaluateSyncRules } from "../src/sync/sync-rule-evaluator";

describe(" sync rule evaluator", () => {
	it("returns empty results for no matches", () => {
		const results = evaluateSyncRules([]);
		expect(results).toEqual([]);
	});

	it("maps fields using PropertyTranslation internal paths", () => {
		const results = evaluateSyncRules([
			{
				rule: {
					ruleId: "test-1",
					targetSchema: "Observation",
					propertyMapping: {
						concept: { internal: "diagnosis" },
						value: { internal: "magnitude" },
					},
					constants: { certainty: "suspected" },
				},
				values: { diagnosis: "C1", magnitude: 42 },
				provenance: { sourceCellId: "cell-1" },
			},
		]);
		expect(results).toHaveLength(1);
		expect(results[0]!.targetSchema).toBe("Observation");
		expect(results[0]!.operation).toBe("add_fact");
		expect(results[0]!.values).toEqual({
			concept: "C1",
			value: 42,
			certainty: "suspected",
		});
	});

	it("skips fields where internal path is missing and no pipeline", () => {
		const results = evaluateSyncRules([
			{
				rule: {
					ruleId: "test-2",
					targetSchema: "Observation",
					propertyMapping: {
						concept: { internal: "diagnosis" },
						missing: { internal: "doesNotExist" },
					},
				},
				values: { diagnosis: "C1" },
				provenance: {},
			},
		]);
		expect(results[0]!.values.concept).toBe("C1");
		expect(results[0]!.values.missing).toBeUndefined();
	});

	it("matches source path and macro provenance exactly", () => {
		const engine = new SyncEngine({
			syncConfig: {
				rules: [
					{
						ruleId: "location-rule",
						sourcePath: "objective.observations[0].value",
						sourceMacroId: "macro-observation",
						targetSchema: "Observation",
						propertyMapping: { value: { internal: "value" } },
					},
				],
			},
		});
		const base: ClinicalDocumentReadModel = {
			documentId: "doc-1",
			sessionId: "s1",
			patientId: "p1",
			status: "draft",
			amendmentNotes: [],
			version: 2,
			eventHead: "h1",
			records: {},
		};
		const matching = {
			...base,
			records: {
				r1: {
					recordId: "r1",
					schemaName: "Observation",
					values: { value: 42 },
					version: 1,
					provenance: {
						sourcePath: "objective.observations[0].value",
						sourceMacroId: "macro-observation",
					},
				},
			},
		};
		const nonMatching = {
			...base,
			records: {
				r1: {
					recordId: "r1",
					schemaName: "Observation",
					values: { value: 42 },
					version: 1,
					provenance: {
						sourcePath: "subjective.observations[0].value",
						sourceMacroId: "macro-observation",
					},
				},
			},
		};
		expect(engine.evaluate(matching)).toHaveLength(1);
		expect(engine.evaluate(nonMatching)).toHaveLength(0);
	});
});

describe(" sync engine", () => {
	const config: SyncConfig = {
		rules: [
			{
				ruleId: "vital-rule",
				targetSchema: "Vital",
				sourceSchema: "Observation",
				propertyMapping: {
					concept: { internal: "concept" },
					value: { internal: "value" },
				},
				defaultCertainty: "neutral",
			},
		],
	};

	it("evaluates sync rules against a clinical document projection", () => {
		const engine = new SyncEngine({ syncConfig: config });
		const doc: ClinicalDocumentReadModel = {
			documentId: "doc-1",
			sessionId: "s1",
			patientId: "p1",
			status: "draft",
			amendmentNotes: [],
			version: 2,
			eventHead: "h1",
			records: {
				r1: {
					recordId: "r1",
					schemaName: "Observation",
					values: { concept: "BP", value: 120 },
					version: 1,
				},
			},
		};
		const results = engine.evaluate(doc);
		expect(results).toHaveLength(1);
		expect(results[0]!.targetSchema).toBe("Vital");
		expect(results[0]!.values.concept).toBe("BP");
	});

	it("skips removed records", () => {
		const engine = new SyncEngine({ syncConfig: config });
		const doc: ClinicalDocumentReadModel = {
			documentId: "doc-1",
			sessionId: "s1",
			patientId: "p1",
			status: "draft",
			amendmentNotes: [],
			version: 2,
			eventHead: "h1",
			records: {
				r1: {
					recordId: "r1",
					schemaName: "Observation",
					values: { concept: "BP" },
					version: 1,
					removed: true,
				},
			},
		};
		expect(engine.evaluate(doc)).toMatchObject([
			{ operation: "remove_fact", factId: "doc-1:r1:vital-rule:global" },
		]);
	});

	it("returns empty when no sync config is set", () => {
		const engine = new SyncEngine();
		const doc: ClinicalDocumentReadModel = {
			documentId: "doc-1",
			sessionId: "s1",
			patientId: "p1",
			status: "draft",
			amendmentNotes: [],
			version: 1,
			records: {},
		};
		expect(engine.evaluate(doc)).toEqual([]);
	});
});

describe(" ProjectionRegistry", () => {
	it("registers and invokes handlers matching committed participant kinds", async () => {
		const registry = new ProjectionRegistry();
		const calls: string[] = [];
		registry.register({
			kind: "clinical_events",
			onCommitted: async () => {
				calls.push("clinical");
			},
		});
		registry.register({
			kind: "workspace_events",
			onCommitted: async () => {
				calls.push("workspace");
			},
		});
		registry.register({
			kind: "cells",
			onCommitted: async () => {
				calls.push("cells");
			},
		});

		await registry.onCommitted({
			transactionId: "tx-1",
			plan: {} as any,
			participantStates: [
				{ participantId: "p1", kind: "clinical_events", status: "committed" },
				{ participantId: "p2", kind: "workspace_events", status: "committed" },
			],
		});
		expect(calls).toEqual(["clinical", "workspace"]);
	});

	it("throws on duplicate registration", () => {
		const registry = new ProjectionRegistry();
		const handler = {
			kind: "clinical_events" as const,
			onCommitted: async () => {},
		};
		registry.register(handler);
		expect(() => registry.register(handler)).toThrow(/already registered/);
	});
});
