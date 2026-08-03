import { describe, expect, it } from "bun:test";
import { CellTransactionParticipant } from "../src/v2/engine/cell-transaction-participant";
import { KvCellStore } from "../src/v2/cells/kv-cell-store";
import type { StructuredCell } from "../src/v2/cells/structured-cell";
import { MemoryKvBackend } from "@stateful-mcp/core";

function makeCell(overrides: Partial<StructuredCell> = {}): StructuredCell {
	return {
		cellId: "cell-1",
		sessionId: "s1",
		collection: { kind: "workspace", ref: "ws-1" },
		source: { origin: "macro_generated", createdAt: "t1", updatedAt: "t1" },
		authored: { rawText: "test" },
		lifecycle: { status: "pending_commit", revision: 2 },
		execution: {},
		provenance: {},
		relationships: {},
		diagnostics: [],
		...overrides,
	};
}

describe("V2 CellTransactionParticipant", () => {
it("commits staged cells through the participant lifecycle", async () => {
		const store = new KvCellStore(new MemoryKvBackend());
		await store.save(makeCell({ cellId: "cell-exec" }));
		const participant = new CellTransactionParticipant(store);
		const context = {
			transactionId: "tx-exec",
			idempotencyKey: "ik-exec",
			plan: {
				groupId: "g1",
				scope: { kind: "composite", sessionId: "s1", documentId: "doc-1" },
				macroDefinitions: [], operations: [{ operationId: "o1", groupId: "g1", cellRef: "cell-exec", targetSchema: "Note", targetPath: "value", value: { kind: "scalar", scalarType: "string", value: "x" }, rawValue: "x", sourceLine: 1, evidence: [] }], links: [], generatedCells: [],
				expectedVersions: [],
				fingerprint: { value: "f-exec", algorithm: "v2-plan-fingerprint-v1" },
				diagnostics: [],
			},
		};

		await participant.stage(context);
		const receipt = await participant.appendEvents(context);
		await participant.finalize(context);
		const committed = await store.get("cell-exec");
		expect(committed?.lifecycle.status).toBe("committed");
		expect(receipt.eventIds).toContain("cell-exec");
	});

	it("returns empty receipt when no cells staged", async () => {
		const store = new KvCellStore(new MemoryKvBackend());
		const participant = new CellTransactionParticipant(store);
		const context = {
			transactionId: "tx-2",
			idempotencyKey: "ik-2",
			plan: {
				groupId: "g2",
				scope: { kind: "workspace", sessionId: "s1" },
				macroDefinitions: [], operations: [], links: [], generatedCells: [],
				expectedVersions: [],
				fingerprint: { value: "f2", algorithm: "v2-plan-fingerprint-v1" },
				diagnostics: [],
			},
		};

		await participant.stage(context);
		const receipt = await participant.appendEvents(context);

		expect(receipt.commitId).toBe("");
		expect(receipt.eventIds).toEqual([]);
	});

	it("does not re-commit cells already committed", async () => {
		const store = new KvCellStore(new MemoryKvBackend());
		await store.save(makeCell({ cellId: "cell-already-done", lifecycle: { status: "committed", revision: 3 } }));
		const participant = new CellTransactionParticipant(store);
		const context = {
			transactionId: "tx-3",
			idempotencyKey: "ik-3",
			plan: {
				groupId: "g3",
				scope: { kind: "composite", sessionId: "s1" },
				macroDefinitions: [], operations: [{ operationId: "o1", groupId: "g3", cellRef: "cell-already-done", targetSchema: "Note", targetPath: "value", value: { kind: "scalar", scalarType: "string", value: "x" }, rawValue: "x", sourceLine: 1, evidence: [] }], links: [], generatedCells: [],
				expectedVersions: [],
				fingerprint: { value: "f3", algorithm: "v2-plan-fingerprint-v1" },
				diagnostics: [],
			},
		};

		await participant.stage(context);
		const receipt = await participant.appendEvents(context);
		const cell = await store.get("cell-already-done");
		expect(cell?.lifecycle.status).toBe("committed");
	});

	it("rejects a stale expected cell revision during staging", async () => {
		const store = new KvCellStore(new MemoryKvBackend());
		await store.save(makeCell({ cellId: "cell-stale", lifecycle: { status: "pending_commit", revision: 4 } }));
		const participant = new CellTransactionParticipant(store);
		const context = {
			transactionId: "tx-stale-cell", idempotencyKey: "ik-stale-cell",
			plan: {
				groupId: "g4", scope: { kind: "workspace", sessionId: "s1" },
				macroDefinitions: [], links: [], generatedCells: [],
				operations: [{ operationId: "o1", groupId: "g4", cellRef: "cell-stale", targetSchema: "Note", targetPath: "value", value: { kind: "scalar", scalarType: "string", value: "x" }, rawValue: "x", sourceLine: 1, evidence: [] }],
				expectedVersions: [{ aggregateKind: "cell" as const, aggregateId: "cell-stale", expectedVersion: 3 }],
				fingerprint: { value: "f4", algorithm: "v2-plan-fingerprint-v1" as const }, diagnostics: [],
			},
		};
		await expect(participant.stage(context)).rejects.toThrow(/revision mismatch/);
	});
});
