import { describe, expect, test } from "bun:test";
import type { Cell } from "../src/session/cell";
import { CellProcessor } from "../src/session/cell-processor";
import { WorkspaceCellService } from "../src/session/workspace-cell-service";
import type { CellStore } from "../src/store/interfaces";

function makeCell(overrides: Partial<Cell> = {}): Cell {
	return {
		cellId: "cell_1",
		sessionId: "session_1",
		mode: "cdsl",
		rawInput: "#vital temp 38.9 C",
		routing: { scope: "global", targetSchema: null },
		parsedOutput: null,
		status: "draft",
		context: { objects: {} },
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function makeMockCellStore(): CellStore {
	const cells = new Map<string, Cell>();
	return {
		async get(cellId: string) {
			return cells.get(cellId) ?? null;
		},
		async list(sessionId: string) {
			return Array.from(cells.values()).filter(
				(c) => c.sessionId === sessionId,
			);
		},
		async save(cell: Cell) {
			cells.set(cell.cellId, cell);
		},
		async delete(cellId: string) {
			cells.delete(cellId);
		},
	};
}

describe("CellProcessor lifecycle", () => {
	test("resetToDraft clears preview data and returns draft", () => {
		const processor = new CellProcessor({} as any);
		const cell = makeCell({
			status: "pending_commit",
			parsedOutput: [{ targetSchema: "ObservationEvent", concept: [] }],
			workspaceCommands: [{ verb: "confirm", branchRef: "b1" }],
			workspaceCommandWarnings: [],
			errorMessage: undefined,
			lockedAt: "2026-01-01T00:00:00Z",
		});
		const result = processor.resetToDraft(cell);
		expect(result.error).toBeUndefined();
		expect(cell.status).toBe("draft");
		expect(cell.parsedOutput).toBeNull();
		expect(cell.workspaceCommands).toBeUndefined();
		expect(cell.workspaceCommandWarnings).toBeUndefined();
		expect(cell.lockedAt).toBeUndefined();
		expect(cell.errorMessage).toBeUndefined();
	});

	test("resetToDraft is idempotent for draft cells", () => {
		const processor = new CellProcessor({} as any);
		const cell = makeCell({ status: "draft" });
		const result = processor.resetToDraft(cell);
		expect(result.error).toBeUndefined();
		expect(cell.status).toBe("draft");
	});

	test("resetToDraft rejects committed cells", () => {
		const processor = new CellProcessor({} as any);
		const cell = makeCell({ status: "committed" });
		const result = processor.resetToDraft(cell);
		expect(result.error).toBeDefined();
		expect(cell.status).toBe("committed");
	});

	test("resetToDraft rejects locked cells", () => {
		const processor = new CellProcessor({} as any);
		const cell = makeCell({ status: "locked" });
		const result = processor.resetToDraft(cell);
		expect(result.error).toBeDefined();
	});

	test("resetToDraft rejects deleted cells", () => {
		const processor = new CellProcessor({} as any);
		const cell = makeCell({ status: "deleted" });
		const result = processor.resetToDraft(cell);
		expect(result.error).toBeDefined();
	});

	test("edit clears preview data and updates rawInput", () => {
		const processor = new CellProcessor({} as any);
		const cell = makeCell({
			status: "pending_commit",
			rawInput: "old input",
			parsedOutput: [{ targetSchema: "ObservationEvent", concept: [] }],
		});
		const result = processor.edit(cell, "new input");
		expect(result.error).toBeUndefined();
		expect(cell.rawInput).toBe("new input");
		expect(cell.status).toBe("draft");
		expect(cell.parsedOutput).toBeNull();
	});

	test("edit rejects committed cells", () => {
		const processor = new CellProcessor({} as any);
		const cell = makeCell({ status: "committed" });
		const result = processor.edit(cell, "new input");
		expect(result.error).toBeDefined();
	});

	test("edit rejects locked cells", () => {
		const processor = new CellProcessor({} as any);
		const cell = makeCell({ status: "locked" });
		const result = processor.edit(cell, "new input");
		expect(result.error).toBeDefined();
	});

	test("pending_commit cell with stale fingerprint is rejected on execute", async () => {
		const processor = new CellProcessor({} as any);
		const cell = makeCell({
			status: "pending_commit",
			rawInput: "original input",
			metadata: { previewFingerprint: "fingerprint_old" },
		});
		const result = await processor.execute(cell);
		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain("stale preview");
	});

	test("pending_commit cell with matching fingerprint executes normally", async () => {
		const engine = {
			processCdsl: async (): Promise<any> =>
				({
					id: "note_1",
					status: "draft",
					patient: { id: "p1" } as any,
					subjective: { presentingComplaint: {} as any },
					objective: { vitalSigns: [] },
					assessment: { differentialDiagnoses: [] },
					plan: {
						prescriptions: [],
						investigations: [],
						referrals: [],
						interventions: [],
					},
				}) as any,
		} as any;

		const processor = new CellProcessor(engine);
		const cell = makeCell({
			status: "pending_commit",
			rawInput: "#vital temp 38.9 C",
			routing: { scope: "global", targetSchema: null },
			metadata: {},
		});
		const result = await processor.execute(cell);
		expect(result.error).toBeUndefined();
		expect(result.cell.status).toBe("committed");
	});
});

describe("WorkspaceCellService", () => {
	test("creates a workspace cell with draft status", async () => {
		const cellStore = makeMockCellStore();
		const workspaceStore = {
			get: async () => ({
				id: "work_1",
				sourceSoapNoteId: "note_1",
				branches: [
					{
						id: "branch_1",
						name: "PE",
						status: "active" as const,
						hypothesisConcept: { conceptId: "SNOMED::59282003", display: "PE" },
						supportingConcepts: [],
						refutingConcepts: [],
						createdAt: {
							assertedTimestampUtc: "2026-01-01T00:00:00Z",
							precisionLevel: "second" as const,
						},
					},
				],
				activeBranchId: "branch_1",
				globalFacts: [],
			}),
		} as any;

		const engine = {} as any;
		const processor = new CellProcessor(engine);
		const service = new WorkspaceCellService(
			engine,
			workspaceStore,
			processor,
			cellStore,
		);

		const result = await service.createCell(
			"session_1",
			"work_1",
			"#vital temp 38.9 C",
			{ branchId: "branch_1", routingScope: "branch_local" },
		);

		expect(result.cell.status).toBe("draft");
		expect(result.cell.workspaceId).toBe("work_1");
		expect(result.cell.sessionId).toBe("session_1");
		expect(result.cell.rawInput).toBe("#vital temp 38.9 C");
		expect(result.cell.routing.scope).toBe("branch_local");
		expect(result.cell.routing.branchId).toBe("branch_1");
	});

	test("lists cells filtered by workspaceId", async () => {
		const cellStore = makeMockCellStore();
		const workspaceStore = {
			get: async () => ({
				id: "work_1",
				sourceSoapNoteId: "note_1",
				branches: [],
				activeBranchId: "",
				globalFacts: [],
			}),
		} as any;

		const engine = {} as any;
		const processor = new CellProcessor(engine);
		const service = new WorkspaceCellService(
			engine,
			workspaceStore,
			processor,
			cellStore,
		);

		await service.createCell("session_1", "work_1", "input 1", {
			routingScope: "global",
		});
		await service.createCell("session_1", "work_2", "input 2", {
			routingScope: "global",
		});

		const cells = await service.listCells("session_1", "work_1");
		expect(cells).toHaveLength(1);
		expect(cells[0]!.workspaceId).toBe("work_1");
	});

	test("rejects branch_local without branchId when no active branch", async () => {
		const cellStore = makeMockCellStore();
		const workspaceStore = {
			get: async () => ({
				id: "work_1",
				sourceSoapNoteId: "note_1",
				branches: [],
				activeBranchId: "",
				globalFacts: [],
			}),
		} as any;

		const engine = {} as any;
		const processor = new CellProcessor(engine);
		const service = new WorkspaceCellService(
			engine,
			workspaceStore,
			processor,
			cellStore,
		);

		await expect(
			service.createCell("session_1", "work_1", "input", {
				routingScope: "branch_local",
			}),
		).rejects.toThrow(
			"branch_local routing requires a branchId or an active branch",
		);
	});

	test("supersedes a cell with metadata", async () => {
		const cellStore = makeMockCellStore();
		const workspaceStore = {
			get: async () => ({
				id: "work_1",
				sourceSoapNoteId: "note_1",
				branches: [],
				activeBranchId: "",
				globalFacts: [],
			}),
		} as any;

		const engine = {} as any;
		const processor = new CellProcessor(engine);
		const service = new WorkspaceCellService(
			engine,
			workspaceStore,
			processor,
			cellStore,
		);

		const original = await service.createCell(
			"session_1",
			"work_1",
			"original input",
			{ routingScope: "global" },
		);

		const correction = await service.supersedeCell(
			"session_1",
			"work_1",
			original.cellId,
			"corrected input",
		);

		expect(correction.cell.metadata?.supersedesCellId).toBe(original.cellId);
		expect(correction.cell.rawInput).toBe("corrected input");
		expect(correction.cell.status).toBe("draft");
	});

	test("rejects delete for committed cells", async () => {
		const cellStore = makeMockCellStore();
		const workspaceStore = {
			get: async () => ({
				id: "work_1",
				sourceSoapNoteId: "note_1",
				branches: [],
				activeBranchId: "",
				globalFacts: [],
			}),
		} as any;

		const engine = {} as any;
		const processor = new CellProcessor(engine);
		const service = new WorkspaceCellService(
			engine,
			workspaceStore,
			processor,
			cellStore,
		);

		const created = await service.createCell("session_1", "work_1", "input", {
			routingScope: "global",
		});

		const cell = await cellStore.get(created.cellId);
		if (cell) {
			cell.status = "committed";
			await cellStore.save(cell);
		}

		const result = await service.deleteCell(
			"session_1",
			"work_1",
			created.cellId,
		);
		expect(result.error).toBeDefined();
	});

	test("getCell returns null for wrong workspace", async () => {
		const cellStore = makeMockCellStore();
		const workspaceStore = {
			get: async () => ({
				id: "work_1",
				sourceSoapNoteId: "note_1",
				branches: [],
				activeBranchId: "",
				globalFacts: [],
			}),
		} as any;

		const engine = {} as any;
		const processor = new CellProcessor(engine);
		const service = new WorkspaceCellService(
			engine,
			workspaceStore,
			processor,
			cellStore,
		);

		await service.createCell("session_1", "work_1", "input", {
			routingScope: "global",
		});

		const result = await service.getCell("session_1", "work_2", "nonexistent");
		expect(result).toBeNull();
	});

	test("resetCell clears preview data", async () => {
		const cellStore = makeMockCellStore();
		const workspaceStore = {
			get: async () => ({
				id: "work_1",
				sourceSoapNoteId: "note_1",
				branches: [],
				activeBranchId: "",
				globalFacts: [],
			}),
		} as any;

		const engine = {} as any;
		const parser = {
			getProfile: () => ({ cellCommandToken: ":" }),
			parse: async () => [
				{ targetSchema: "ObservationEvent", concept: [], extractedData: {} },
			],
		} as any;
		const processor = new CellProcessor(engine, undefined, parser);
		const service = new WorkspaceCellService(
			engine,
			workspaceStore,
			processor,
			cellStore,
		);

		const created = await service.createCell(
			"session_1",
			"work_1",
			"#vital temp 38.9 C",
			{ routingScope: "global" },
		);

		const previewResult = await service.previewCell(
			"session_1",
			"work_1",
			created.cellId,
		);
		expect(previewResult.error).toBeUndefined();
		expect(previewResult.cell.status).toBe("pending_commit");

		const resetResult = await service.resetCell(
			"session_1",
			"work_1",
			created.cellId,
		);
		expect(resetResult.error).toBeUndefined();
		expect(resetResult.cell.status).toBe("draft");
		expect(resetResult.cell.parsedOutput).toBeNull();
	});

	test("editCell invalidates preview", async () => {
		const cellStore = makeMockCellStore();
		const workspaceStore = {
			get: async () => ({
				id: "work_1",
				sourceSoapNoteId: "note_1",
				branches: [],
				activeBranchId: "",
				globalFacts: [],
			}),
		} as any;

		const engine = {} as any;
		const parser = {
			getProfile: () => ({ cellCommandToken: ":" }),
			parse: async () => [
				{ targetSchema: "ObservationEvent", concept: [], extractedData: {} },
			],
		} as any;
		const processor = new CellProcessor(engine, undefined, parser);
		const service = new WorkspaceCellService(
			engine,
			workspaceStore,
			processor,
			cellStore,
		);

		const created = await service.createCell(
			"session_1",
			"work_1",
			"#vital temp 38.9 C",
			{ routingScope: "global" },
		);

		await service.previewCell("session_1", "work_1", created.cellId);

		const editResult = await service.editCell(
			"session_1",
			"work_1",
			created.cellId,
			"#vital temp 39.1 C",
		);
		expect(editResult.error).toBeUndefined();
		expect(editResult.cell.status).toBe("draft");
		expect(editResult.cell.parsedOutput).toBeNull();
		expect(editResult.cell.rawInput).toBe("#vital temp 39.1 C");
	});
});
