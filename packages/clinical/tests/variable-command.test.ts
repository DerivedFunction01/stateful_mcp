import { describe, expect, test } from "bun:test";
import { MemoryVariableStore, VariableServiceStore } from "@stateful-mcp/core";
import { VariableCellService } from "../src/session/variable-cell-service";
import { parseVariableCommand } from "../src/session/variable-command-parser";

function makeCellStore() {
	const cells = new Map<string, any>();
	return {
		cells,
		async get(cellId: string) {
			return cells.get(cellId) ?? null;
		},
		async list() {
			return [...cells.values()];
		},
		async listByCollection(_sessionId: string, collection: any) {
			return [...cells.values()].filter(
				(cell) =>
					cell.collection.kind === collection.kind &&
					cell.collection.collectionId === collection.collectionId,
			);
		},
		async save(cell: any) {
			cells.set(cell.cellId, structuredClone(cell));
		},
		async delete(cellId: string) {
			cells.delete(cellId);
		},
	};
}

describe("variable command parsing", () => {
	test("parses namespaced operations into typed statements", () => {
		expect(parseVariableCommand(":var set weight = 80")).toMatchObject({
			kind: "set",
			target: { name: "weight" },
		});
		expect(parseVariableCommand(":var eval weight * 2")).toMatchObject({
			kind: "eval",
		});
		expect(parseVariableCommand(":var remove weight")).toMatchObject({
			kind: "remove",
		});
	});
});

describe("variable cells", () => {
	test("persist variable mutation cells and retain concept values", async () => {
		const variableService = new VariableServiceStore(new MemoryVariableStore());
		const cellStore = makeCellStore();
		const service = new VariableCellService(
			variableService,
			cellStore as any,
			async () => ({ conceptId: "PE", display: "pulmonary embolism" }),
		);
		const collection = { kind: "workspace" as const, collectionId: "work_1" };

		await service.execute(
			"session_1",
			collection,
			':var set diagnosis = @"pulmonary embolism"',
			{
				kind: "workspace",
				id: "work_1",
			},
		);
		const value = await variableService.getVariable(
			"session_1",
			"diagnosis",
			"work_1",
		);
		expect(value).toEqual({ conceptId: "PE", display: "pulmonary embolism" });
		expect([...cellStore.cells.values()][0]?.intentKind).toBe(
			"variable_command",
		);
		expect([...cellStore.cells.values()][0]?.status).toBe("committed");
	});

	test("failed assertions persist an error cell", async () => {
		const variableService = new VariableServiceStore(new MemoryVariableStore());
		const cellStore = makeCellStore();
		const service = new VariableCellService(variableService, cellStore as any);

		await expect(
			service.execute(
				"session_1",
				{ kind: "workspace", collectionId: "work_1" },
				":var assert 1 == 2",
			),
		).rejects.toThrow();
		expect([...cellStore.cells.values()][0]?.status).toBe("error");
	});
});
