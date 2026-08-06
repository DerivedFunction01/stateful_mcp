import { describe, expect, it } from "bun:test";
import { MemoryKvBackend, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import type { CellStore } from "../src/cells/cell-service-types";
import { KvCellStore } from "../src/cells/kv-cell-store";
import { SqlCellStore } from "../src/cells/sql-cell-store";
import { StructuredCellService } from "../src/cells/structured-cell-service";
import type { FinalizedMacroCommit } from "../src/macros/macro-authoring-session";

async function compile(rawText: string) {
	return {
		plan: { operations: [], generatedCells: [] },
		diagnostics: [],
		fingerprint: `fp_${rawText.length}`,
	};
}

function finalizedMacro(): FinalizedMacroCommit {
	return {
		authoredText: "^observation duration=2 hours",
		macroDefinitionId: "macro-observation",
		macroDefinitionVersion: 1,
		bindings: [],
		plan: {
			groupId: "group-1",
			scope: { kind: "clinical_document", sessionId: "s1" },
			macroDefinitions: [],
			operations: [],
			links: [],
			generatedCells: [],
			expectedVersions: [],
			fingerprint: {
				value: "finalized-fingerprint",
				algorithm: "v2-plan-fingerprint-v1",
			},
			diagnostics: [],
		},
		diagnostics: [],
		fingerprint: "finalized-fingerprint",
	};
}

function kvStore(): CellStore {
	return new KvCellStore(new MemoryKvBackend());
}

async function sqlStore(): Promise<CellStore> {
	const backend = await SqlBackend.connect("sqlite", ":memory:");
	return new SqlCellStore("sqlite", new SqlExecutor(backend));
}

describe.each([
	["kv", () => kvStore()],
	["sql", async () => sqlStore()],
])(" structured cell service (%s)", (_name, makeStore) => {
	it("creates a draft cell", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const cell = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		expect(cell.cellId).toBeTruthy();
		expect(cell.sessionId).toBe("s1");
		expect(cell.lifecycle.status).toBe("draft");
		expect(cell.lifecycle.revision).toBe(1);
		expect(cell.authored.rawText).toBe("^observation duration=2 hours");
		expect(cell.source.origin).toBe("user");
	});

	it("gets a cell by ID", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		const fetched = await service.get(created.cellId);
		expect(fetched).not.toBeNull();
		expect(fetched?.cellId).toBe(created.cellId);
	});

	it("creates and persists a finalized Macro cell as pending", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const finalized = finalizedMacro();
		const cell = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: finalized.authoredText,
			finalizedMacro: finalized,
		});

		expect(cell.lifecycle.status).toBe("pending_commit");
		expect(cell.execution.planFingerprint).toBe("finalized-fingerprint");
		expect(cell.authored.finalizedMacro).toEqual(finalized);
		expect(await service.get(cell.cellId)).toEqual(cell);
	});

	it("executes a finalized Macro plan without recompiling raw text", async () => {
		let compileCalls = 0;
		const service = new StructuredCellService({
			store: await makeStore(),
			compile: async (rawText) => {
				compileCalls += 1;
				return compile(rawText);
			},
			executePlan: async (executionPlan) => ({
				status: "committed",
				transactionId: "tx-finalized",
				planFingerprint: executionPlan.fingerprint.value,
			}),
		});
		const finalized = finalizedMacro();
		const cell = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: finalized.authoredText,
			finalizedMacro: finalized,
		});

		const result = await service.executeFinalizedMacro(
			cell.cellId,
			"idem-finalized-1",
		);
		expect(result.status).toBe("committed");
		expect(result.transactionId).toBe("tx-finalized");
		expect(compileCalls).toBe(0);
		expect((await service.get(cell.cellId))?.lifecycle.status).toBe(
			"committed",
		);
	});

	it("rejects a finalized Macro when its plan fingerprint is stale", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
			executePlan: async () => ({
				status: "committed",
				transactionId: "tx-finalized",
				planFingerprint: "finalized-fingerprint",
			}),
		});
		const finalized = finalizedMacro();
		const cell = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: finalized.authoredText,
			finalizedMacro: { ...finalized, fingerprint: "stale-fingerprint" },
		});

		await expect(
			service.executeFinalizedMacro(cell.cellId, "idem-finalized-2"),
		).rejects.toThrow("fingerprint mismatch");
	});

	it("records a committed Macro reversal without changing the authored cell", async () => {
		let reversed = 0;
		const store = await makeStore();
		const service = new StructuredCellService({
			store,
			compile,
			reversePlan: async (transactionId, idempotencyKey) => {
				reversed += 1;
				expect(transactionId).toBe("tx-original");
				expect(idempotencyKey).toBe("idem-reversal");
				return {
					status: "committed",
					transactionId: "tx-reversal",
					planFingerprint: "reversal-fingerprint",
				};
			},
		});
		const finalized = finalizedMacro();
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: finalized.authoredText,
			finalizedMacro: finalized,
		});
		await store.save({
			...created,
			lifecycle: { ...created.lifecycle, status: "committed" },
			execution: {
				...created.execution,
				transactionId: "tx-original",
				committedAt: new Date().toISOString(),
			},
		});

		const result = await service.reverseFinalizedMacro(
			created.cellId,
			"idem-reversal",
		);
		const repeated = await service.reverseFinalizedMacro(
			created.cellId,
			"idem-reversal",
		);
		const updated = await service.get(created.cellId);
		expect(result.status).toBe("committed");
		expect(repeated.transactionId).toBe("tx-reversal");
		expect(reversed).toBe(1);
		expect(updated?.authored.rawText).toBe(finalized.authoredText);
		expect(updated?.execution.reversalTransactionId).toBe("tx-reversal");
		expect(updated?.execution.reversedAt).toBeTruthy();
		expect(updated?.lifecycle.revision).toBe(created.lifecycle.revision + 1);
	});

	it("lists cells by session", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});
		await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=1 hour",
		});

		const cells = await service.list("s1");
		expect(cells.length).toBe(2);
	});

	it("edits a draft cell and increments revision", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		const edited = await service.edit({
			cellId: created.cellId,
			rawText: "^observation duration=4 hours",
			expectedRevision: 1,
		});

		expect(edited.lifecycle.revision).toBe(2);
		expect(edited.authored.rawText).toBe("^observation duration=4 hours");
		expect(edited.lifecycle.status).toBe("draft");
	});

	it("rejects edit on committed cell", async () => {
		const store = await makeStore();
		const created = await store.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});
		const committed = {
			...created,
			lifecycle: { ...created.lifecycle, status: "committed" as const },
		};
		await store.save(committed);

		const service = new StructuredCellService({ store, compile });
		await expect(
			service.edit({
				cellId: created.cellId,
				rawText: "changed",
				expectedRevision: 1,
			}),
		).rejects.toThrow("immutable");
	});

	it("rejects edit with wrong revision", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		await expect(
			service.edit({
				cellId: created.cellId,
				rawText: "changed",
				expectedRevision: 99,
			}),
		).rejects.toThrow("revision mismatch");
	});

	it("previews a cell without mutating it", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		const preview = await service.preview({
			cellId: created.cellId,
			expectedRevision: 1,
		});
		expect(preview.previewId).toBeTruthy();
		expect(preview.cellId).toBe(created.cellId);
		expect(preview.status).toBe("valid");
		expect(preview.diagnostics).toEqual([]);
		expect(await service.get(created.cellId)).toEqual(created);
	});

	it("executes a draft cell and transitions to committed", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
			executePlan: async () => ({
				status: "committed",
				transactionId: "tx-test",
				planFingerprint: "fp-test",
			}),
		});
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		const preview = await service.preview({
			cellId: created.cellId,
			expectedRevision: 1,
		});
		const result = await service.execute({
			cellId: created.cellId,
			expectedRevision: 1,
			previewId: preview.previewId,
			planFingerprint: preview.planFingerprint,
			idempotencyKey: "idem-execute-1",
		});

		expect(result.status).toBe("committed");
		expect(result.transactionId).toBe("tx-test");

		const updated = await service.get(created.cellId);
		expect(updated?.lifecycle.status).toBe("committed");
	});

	it("rejects execute with wrong revision", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		await expect(
			service.execute({
				cellId: created.cellId,
				expectedRevision: 99,
				previewId: "preview-1",
				planFingerprint: "fp-1",
				idempotencyKey: "idem-execute-2",
			}),
		).rejects.toThrow("revision mismatch");
	});

	it("cancels a draft cell", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		const cancelled = await service.cancel({
			cellId: created.cellId,
			expectedRevision: 1,
		});
		expect(cancelled.lifecycle.status).toBe("cancelled");
		expect(cancelled.lifecycle.revision).toBe(2);
	});

	it("rejects cancel on committed cell", async () => {
		const store = await makeStore();
		const created = await store.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});
		const committed = {
			...created,
			lifecycle: { ...created.lifecycle, status: "committed" as const },
		};
		await store.save(committed);

		const service = new StructuredCellService({ store, compile });
		await expect(
			service.cancel({ cellId: created.cellId, expectedRevision: 1 }),
		).rejects.toThrow("immutable");
	});

	it("supersedes a cell creating a new draft", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		const superseded = await service.supersede({
			cellId: created.cellId,
			newRawText: "^observation duration=4 hours",
			expectedRevision: 1,
			authorId: "author-1",
		});

		expect(superseded.cellId).not.toBe(created.cellId);
		expect(superseded.lifecycle.status).toBe("draft");
		expect(superseded.lifecycle.revision).toBe(1);
		expect(superseded.authored.rawText).toBe("^observation duration=4 hours");
		expect(superseded.source.origin).toBe("macro_generated");
		expect(superseded.source.authorId).toBe("author-1");
		expect(superseded.provenance.sourceCellId).toBe(created.cellId);
		expect(superseded.relationships.supersedesCellId).toBe(created.cellId);
	});

	it("rejects supersede with wrong revision", async () => {
		const service = new StructuredCellService({
			store: await makeStore(),
			compile,
		});
		const created = await service.create({
			sessionId: "s1",
			collection: { kind: "notebook", collectionId: "n1" },
			rawText: "^observation duration=2 hours",
		});

		await expect(
			service.supersede({
				cellId: created.cellId,
				newRawText: "changed",
				expectedRevision: 99,
			}),
		).rejects.toThrow("revision mismatch");
	});
});
