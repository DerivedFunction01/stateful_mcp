import { describe, expect, it } from "bun:test";
import { MemoryKvBackend, VariableServiceStore } from "@stateful-mcp/core";
import { KvCellStore } from "../src/cells/kv-cell-store";
import { VariableCellService } from "../src/cells/variable-cell-service";
import { createCommandSyntaxProfile } from "../src/commands/command-syntax-profile";
import { VariableCommandService } from "../src/commands/variable-command-service";
import { bootstrapCommandDefaults } from "../src/bootstrap/bootstrap-config";

describe(" variable cell service", () => {
	it("records a successful variable command as a committed structured cell", async () => {
		const variables = new VariableServiceStore();
		const service = new VariableCellService(
			new KvCellStore(new MemoryKvBackend()),
			new VariableCommandService(variables),
			createCommandSyntaxProfile(
				{ profileId: "test" },
				bootstrapCommandDefaults,
			),
		);
		const result = await service.execute(
			"s1",
			{ kind: "notebook", collectionId: "s1" },
			":var set count = 2",
		);

		expect(result.cell.lifecycle.status).toBe("committed");
		expect(result.cell.authored.intent?.kind).toBe("variable");
		expect(result.value).toBe(2);
		expect(await variables.getVariable("s1", "count")).toBe(2);
	});

	it("records failed variable commands without leaving a committed cell", async () => {
		const store = new KvCellStore(new MemoryKvBackend());
		const service = new VariableCellService(
			store,
			new VariableCommandService(new VariableServiceStore()),
			createCommandSyntaxProfile(
				{ profileId: "test" },
				bootstrapCommandDefaults,
			),
		);
		await expect(
			service.execute(
				"s1",
				{ kind: "notebook", collectionId: "s1" },
				":var set bad-name = 1",
			),
		).rejects.toThrow();
		const cells = await store.list("s1");
		expect(cells).toHaveLength(1);
		expect(cells[0]?.lifecycle.status).toBe("failed");
	});
});
