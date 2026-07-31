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
		context: { objects: {} },
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
					}) as unknown as SoapNote,
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

		test("execute: narrative cell sets field on SoapNote", async () => {
			const mockNote = {
				id: "note_1",
				title: "Test",
				status: "draft",
				patient: { id: "p1" } as any,
				subjective: { historyOfPresentIllness: { narrative: "" } },
				objective: {},
				assessment: {},
				plan: {},
			} as unknown as SoapNote;

			const engine = {
				setSoapNoteField: async (
					_sessionId: string,
					fieldPath: string,
					value: string,
					_alias?: string,
				): Promise<SoapNote> => {
					// Simulate setting the field on the note
					const parts = fieldPath.split(".");
					let current: any = mockNote;
					for (let i = 0; i < parts.length - 1; i++) {
						const key = parts[i]!;
						if (!current[key]) current[key] = {};
						current = current[key];
					}
					current[parts[parts.length - 1]!] = value;
					return mockNote;
				},
			} as unknown as ClinicalEngine;

			const processor = new CellProcessor(engine);
			const cell = makeCell({
				mode: "narrative",
				rawInput: "Patient reports chest pain for 3 days",
				narrativeTarget: "subjective.historyOfPresentIllness.narrative",
			});
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("committed");
			expect(result.cell.lockedAt).toBeDefined();
			expect(result.cell.metadata?.sourceType).toBe("narrative");
			expect(result.cell.parsedOutput).toBeNull();
			expect(result.soapNote).toBeDefined();
			expect(result.error).toBeUndefined();
		});

		test("execute: narrative cell without narrativeTarget returns error", async () => {
			const engine = {} as unknown as ClinicalEngine;
			const processor = new CellProcessor(engine);
			const cell = makeCell({
				mode: "narrative",
				rawInput: "Some narrative text",
			});
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("error");
			expect(result.error?.code).toBe(CellError.NARRATIVE_TARGET_REQUIRED);
			expect(result.cell.lockedAt).toBeUndefined();
		});

		test("execute: narrative cell propagates engine errors", async () => {
			const engine = {
				setSoapNoteField: async (): Promise<SoapNote> => {
					throw new Error("engine failure");
				},
			} as unknown as ClinicalEngine;

			const processor = new CellProcessor(engine);
			const cell = makeCell({
				mode: "narrative",
				rawInput: "Some text",
				narrativeTarget: "plan.narrative",
			});
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("error");
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

		test("preview: narrative cell returns error", async () => {
			const processor = new CellProcessor({
				renderNote: async () => null,
			} as unknown as ClinicalEngine);
			const cell = makeCell({
				mode: "narrative",
				rawInput: "Some narrative text",
				narrativeTarget: "plan.narrative",
			});
			const result = await processor.preview(cell);

			expect(result.error).toBeDefined();
			expect(result.error?.message).toBe(
				"preview not available for narrative cells",
			);
			expect(result.cell.status).toBe("draft");
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

	describe("preprocess", () => {
		test("returns original text when no preprocessor is configured", async () => {
			const processor = new CellProcessor({} as ClinicalEngine);
			const cell = makeCell({ rawInput: "#vital temp 38.9 C" });
			const result = await processor.preprocess(cell);

			expect(result.cleanedText).toBe("#vital temp 38.9 C");
			expect(result.cell.routing).toEqual(cell.routing);
		});

		test("strips /notes directive and sets routing", async () => {
			const mockPreprocessor = {
				applyVariables: async (_text: string, _sessionId: string) => _text,
				expandMacros: async (text: string) => text,
			};

			const mockParser = {
				getProfile: () => ({
					tagToken: "#",
					schemaNamespaces: {},
					tagMappings: {},
				}),
			};

			const processor = new CellProcessor(
				{} as ClinicalEngine,
				undefined,
				mockParser as any,
				mockPreprocessor as any,
			);
			const cell = makeCell({
				rawInput: "/notes/objective/vitals #vital temp 38.9 C",
				routing: { scope: "global", targetSchema: null },
			});
			const result = await processor.preprocess(cell);

			expect(result.cleanedText).toBe("#vital temp 38.9 C");
			expect(result.cell.routing.resolvedSection).toBe("objective");
			expect(result.cell.routing.resolvedSchema).toBe("vitals");
			expect(result.cell.routing.targetSchema).toBe("vitals");
		});

		test("sets resolvedSection=null when directive uses ?", async () => {
			const mockPreprocessor = {
				applyVariables: async (_text: string, _sessionId: string) => _text,
				expandMacros: async (text: string) => text,
			};

			const mockParser = {
				getProfile: () => ({
					tagToken: "#",
					schemaNamespaces: {},
					tagMappings: {},
				}),
			};

			const processor = new CellProcessor(
				{} as ClinicalEngine,
				undefined,
				mockParser as any,
				mockPreprocessor as any,
			);
			const cell = makeCell({
				rawInput: "/notes/subjective/? #vital temp 38.9 C",
				routing: { scope: "global", targetSchema: null },
			});
			const result = await processor.preprocess(cell);

			expect(result.cleanedText).toBe("#vital temp 38.9 C");
			expect(result.cell.routing.resolvedSection).toBe("subjective");
			expect(result.cell.routing.resolvedSchema).toBeNull();
			expect(result.cell.routing.targetSchema).toBeNull();
		});

		test("infers targetSchema from first tag when no directive", async () => {
			const mockPreprocessor = {
				applyVariables: async (_text: string, _sessionId: string) => _text,
				expandMacros: async (text: string) => text,
			};

			const mockParser = {
				getProfile: () => ({
					tagToken: "#",
					schemaNamespaces: {},
					tagMappings: {},
				}),
			};

			const processor = new CellProcessor(
				{} as ClinicalEngine,
				undefined,
				mockParser as any,
				mockPreprocessor as any,
			);
			const cell = makeCell({
				rawInput: "#vital temp 38.9 C",
				routing: { scope: "global", targetSchema: null },
			});
			const result = await processor.preprocess(cell);

			expect(result.cleanedText).toBe("#vital temp 38.9 C");
			expect(result.cell.routing.targetSchema).toBeNull();
		});
	});

	describe("execute with preprocessor", () => {
		test("uses preprocessed text for global routing", async () => {
			const cleanedText = "#vital temp 38.9 C";
			const mockPreprocessor = {
				applyVariables: async (_text: string, _sessionId: string) =>
					cleanedText,
				expandMacros: async (text: string) => text,
			};

			const engine = {
				processCdsl: async (
					_sessionId: string,
					dictation: string,
					_alias?: string,
				): Promise<SoapNote> => {
					expect(dictation).toBe(cleanedText);
					return {
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
					} as unknown as SoapNote;
				},
			} as unknown as ClinicalEngine;

			const processor = new CellProcessor(
				engine,
				undefined,
				undefined,
				mockPreprocessor as any,
			);
			const cell = makeCell();
			const result = await processor.execute(cell);

			expect(result.cell.status).toBe("committed");
			expect(result.cell.lockedAt).toBeDefined();
			expect(result.soapNote).toBeDefined();
			expect(result.error).toBeUndefined();
		});
	});

	describe("preview with preprocessor", () => {
		test("uses preprocessed text and passes routingContext", async () => {
			const cleanedText = "#vital temp 38.9 C";
			const mockPreprocessor = {
				applyVariables: async (_text: string, _sessionId: string) =>
					cleanedText,
				expandMacros: async (text: string) => text,
			};

			const mockParser = {
				getProfile: () => ({
					tagToken: "#",
					schemaNamespaces: {},
					tagMappings: {},
				}),
				parse: async (text: string) => {
					expect(text).toBe(cleanedText);
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
				mockPreprocessor as any,
			);
			const cell = makeCell();
			const result = await processor.preview(cell);

			expect(result.cell.status).toBe("pending_commit");
			expect(result.cell.parsedOutput).toBeDefined();
			expect(result.cell.parsedOutput?.length).toBe(1);
			expect(result.error).toBeUndefined();
		});
	});
});
