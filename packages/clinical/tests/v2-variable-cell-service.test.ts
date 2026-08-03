import { describe, expect, it } from "bun:test";
import { MemoryKvBackend, VariableServiceStore } from "@stateful-mcp/core";
import { KvCellStore } from "../src/v2/cells/kv-cell-store";
import { V2VariableCellService } from "../src/v2/cells/variable-cell-service";
import { createV2CommandSyntaxProfile } from "../src/v2/commands/command-syntax-profile";
import { V2VariableCommandService } from "../src/v2/commands/variable-command-service";

describe("V2 variable cell service", () => {
	it("records a successful variable command as a committed structured cell", async () => {
		const variables = new VariableServiceStore();
		const service = new V2VariableCellService(
			new KvCellStore(new MemoryKvBackend()),
			new V2VariableCommandService(variables),
			createV2CommandSyntaxProfile({ profileId: "test" }),
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
		const service = new V2VariableCellService(
			store,
			new V2VariableCommandService(new VariableServiceStore()),
			createV2CommandSyntaxProfile({ profileId: "test" }),
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
