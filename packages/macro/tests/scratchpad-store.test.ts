import { describe, expect, test } from "bun:test";
import { MemoryKvBackend, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import {
	KvScratchpadResourceStore,
	SqlScratchpadResourceStore,
} from "src/scratchpad/resource-store";

describe("ScratchpadResourceStore", () => {
	test("KV scratchpad store creates, saves, lists, opens, and deletes resources", async () => {
		const store = new KvScratchpadResourceStore(new MemoryKvBackend());

		const created = await store.create(
			"scratchpad-1",
			"Triage Notes",
			"^vitals 120 80\n^dx fever",
			{ author: "clinical" },
		);
		expect(created.scratchpadId).toBe("scratchpad-1");
		expect(created.title).toBe("Triage Notes");
		expect(created.lines).toHaveLength(2);
		expect(created.metadata).toEqual({ author: "clinical" });

		// Update state with execution marks and cell defaults
		created.executedLineIndices = [0];
		created.lines[0]!.defaultMacroId = "vitals";
		created.lines[1]!.defaultMacroId = "dx";
		created.textRevision = 2;
		await store.save(created);

		const opened = await store.open("scratchpad-1");
		expect(opened).not.toBeNull();
		expect(opened?.title).toBe("Triage Notes");
		expect(opened?.executedLineIndices).toEqual([0]);
		expect(opened?.lines.map((line) => line.defaultMacroId)).toEqual([
			"vitals",
			"dx",
		]);
		expect(opened?.textRevision).toBe(2);

		const list = await store.list();
		expect(list).toHaveLength(1);
		expect(list[0]?.scratchpadId).toBe("scratchpad-1");
		expect(list[0]?.title).toBe("Triage Notes");

		await store.delete("scratchpad-1");
		expect(await store.open("scratchpad-1")).toBeNull();
		expect(await store.list()).toHaveLength(0);
	});

	test("SQL scratchpad store serializes and hydrates complete session state", async () => {
		const backend = await SqlBackend.connect("sqlite", ":memory:");
		const store = new SqlScratchpadResourceStore(new SqlExecutor(backend));

		const created = await store.create(
			"scratchpad-sql",
			"SQL Analysis",
			"^triage severe",
			{ project: "demo" },
		);
		expect(created.scratchpadId).toBe("scratchpad-sql");

		created.lines = [
			{
				lineNumber: 1,
				rawText: "^triage severe",
				status: "valid",
				slots: { severity: "severe" },
			},
		];
		created.executedLineIndices = [0];
		created.lines[0]!.defaultMacroId = "triage";
		await store.save(created);

		const opened = await store.open("scratchpad-sql");
		expect(opened?.scratchpadId).toBe("scratchpad-sql");
		expect(opened?.lines[0]?.slots).toEqual({ severity: "severe" });
		expect(opened?.executedLineIndices).toEqual([0]);
		expect(opened?.lines[0]?.defaultMacroId).toBe("triage");

		const list = await store.list();
		expect(list).toHaveLength(1);
		expect(list[0]?.title).toBe("SQL Analysis");

		await store.delete("scratchpad-sql");
		expect(await store.open("scratchpad-sql")).toBeNull();
	});
});
