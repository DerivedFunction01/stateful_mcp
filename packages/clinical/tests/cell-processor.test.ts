import { describe, expect, test } from "bun:test";
import type { ClinicalEngine } from "../src/engine/clinical-engine";
import type { WorkspaceStore } from "../src/engine/workspace-store";
import type { SoapNote } from "../src/schemas/document";
import type { Cell } from "../src/session/cell";
import { CellError } from "../src/session/cell";
import { CellProcessor } from "../src/session/cell-processor";

function makeCell(overrides: Partial<Cell> = {}): Cell {
	return {
		cellId: "cell_1",
		sessionId: "session_1",
		mode: "cdsl",
		rawInput: "#vital temp 38.9 C",
		routing: { scope: "global", targetSchema: null },
		parsedOutput: null,
		status: "draft",
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

describe("CellProcessor", () => {
	describe("execute", () => {
		test("routes global cell to engine.processCdsl", async () => {
			const engine = {
				processCdsl: async (
					_sessionId: string,
					_dictation: string,
					_alias?: string,
				): Promise<SoapNote> =>
					({
						id: "note_1",
						title: "Test",
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
					}) as SoapNote,
			} as unknown as ClinicalEngine;

			const processor = new CellProcessor(engine);
			const cell = makeCell();
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("committed");
			expect(result.cell.lockedAt).toBeDefined();
			expect(result.soapNote).toBeDefined();
			expect(result.error).toBeUndefined();
		});

		test("routes branch_local cell to workspaceStore.process", async () => {
			const engine = {} as unknown as ClinicalEngine;
			const workspaceStore = {
				process: async (
					_sessionId: string,
					_workspaceId: string,
					_branchId: string,
					_dictation: string,
				): Promise<{ id: string }> => ({ id: "ws_1" }),
			} as unknown as WorkspaceStore;

			const processor = new CellProcessor(engine, workspaceStore);
			const cell = makeCell({
				routing: { scope: "branch_local", targetSchema: null, branchId: "B1" },
				workspaceId: "ws_1",
			});
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("committed");
			expect(result.cell.lockedAt).toBeDefined();
			expect(result.workspaceId).toBe("ws_1");
			expect(result.error).toBeUndefined();
		});

		test("rejects unresolved routing scope", async () => {
			const engine = {} as unknown as ClinicalEngine;
			const processor = new CellProcessor(engine);
			const cell = makeCell({
				routing: { scope: "unresolved", targetSchema: null },
			});
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("error");
			expect(result.error?.code).toBe(CellError.UNRESOLVED_ROUTING);
		});

		test("rejects branch_local without workspaceId", async () => {
			const engine = {} as unknown as ClinicalEngine;
			const processor = new CellProcessor(engine);
			const cell = makeCell({
				routing: { scope: "branch_local", targetSchema: null, branchId: "B1" },
			});
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("error");
			expect(result.error?.code).toBe(
				CellError.BRANCH_LOCAL_REQUIRES_WORKSPACE_ID,
			);
		});

		test("rejects branch_local without WorkspaceStore configured", async () => {
			const engine = {} as unknown as ClinicalEngine;
			const processor = new CellProcessor(engine);
			const cell = makeCell({
				routing: { scope: "branch_local", targetSchema: null, branchId: "B1" },
				workspaceId: "ws_1",
			});
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("error");
			expect(result.error?.code).toBe(CellError.WORKSPACE_STORE_NOT_CONFIGURED);
		});

		test("propagates engine errors without committing", async () => {
			const engine = {
				processCdsl: async (): Promise<SoapNote> => {
					throw new Error("parse failure");
				},
			} as unknown as ClinicalEngine;

			const processor = new CellProcessor(engine);
			const cell = makeCell();
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("error");
			expect(result.error?.message).toBe("parse failure");
			expect(result.cell.lockedAt).toBeUndefined();
		});
	});

	describe("preview", () => {
		test("parses rawInput without committing", async () => {
			const mockParser = {
				parse: async (text: string) => {
					return [
						{
							targetSchema: "VitalsMeasurementEvent",
							attributes: { temperature: { magnitude: 38.9, unit: "C" } },
							concept: [],
							rawText: text,
							tag: "#vital",
							extractedData: {},
						},
					];
				},
			};

			const processor = new CellProcessor(
				{} as ClinicalEngine,
				undefined,
				mockParser as any,
			);
			const cell = makeCell();
			const result = await processor.preview(cell);

			expect(result.cell.status).toBe("pending_commit");
			expect(result.cell.parsedOutput).toBeDefined();
			expect(result.cell.parsedOutput?.length).toBe(1);
			expect(result.error).toBeUndefined();
		});

		test("returns error when CdslParser is not configured", async () => {
			const processor = new CellProcessor({} as ClinicalEngine);
			const cell = makeCell();
			const result = await processor.preview(cell);

			expect(result.error?.code).toBe(CellError.PARSER_NOT_CONFIGURED);
			expect(result.cell.status).toBe("draft");
		});

		test("returns error for locked cell", async () => {
			const processor = new CellProcessor({} as ClinicalEngine);
			const cell = makeCell({ status: "locked" });
			const result = await processor.preview(cell);

			expect(result.error?.code).toBe(CellError.CELL_IS_LOCKED);
			expect(result.cell.status).toBe("locked");
		});

		test("returns error for deleted cell", async () => {
			const processor = new CellProcessor({} as ClinicalEngine);
			const cell = makeCell({ status: "deleted" });
			const result = await processor.preview(cell);

			expect(result.error?.code).toBe(CellError.CELL_IS_DELETED);
			expect(result.cell.status).toBe("deleted");
		});
	});

	describe("delete", () => {
		test("marks cell as deleted", () => {
			const processor = new CellProcessor({} as ClinicalEngine);
			const cell = makeCell();
			const result = processor.delete(cell);

			expect(result.cell.status).toBe("deleted");
			expect(result.cell.parsedOutput).toBeNull();
			expect(result.error).toBeUndefined();
		});

		test("rejects locked cell", () => {
			const processor = new CellProcessor({} as ClinicalEngine);
			const cell = makeCell({ status: "locked" });
			const result = processor.delete(cell);

			expect(result.error?.code).toBe(CellError.CELL_IS_LOCKED);
		});
	});

	describe("lock", () => {
		test("sets lockedAt and status to locked", () => {
			const processor = new CellProcessor({} as ClinicalEngine);
			const cell = makeCell({ status: "committed" });
			const result = processor.lock(cell);

			expect(result.cell.status).toBe("locked");
			expect(result.cell.lockedAt).toBeDefined();
			expect(result.error).toBeUndefined();
		});

		test("rejects already locked cell", () => {
			const processor = new CellProcessor({} as ClinicalEngine);
			const cell = makeCell({
				status: "locked",
				lockedAt: "2026-07-30T10:00:00Z",
			});
			const result = processor.lock(cell);

			expect(result.error?.code).toBe(CellError.CELL_IS_ALREADY_LOCKED);
		});

		test("rejects deleted cell", () => {
			const processor = new CellProcessor({} as ClinicalEngine);
			const cell = makeCell({ status: "deleted" });
			const result = processor.lock(cell);

			expect(result.error?.code).toBe(CellError.CANNOT_LOCK_DELETED_CELL);
		});
	});
});
