import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { KvNotebookSessionStore } from "../src/v2/notebook/kv-notebook-session-store";
import { NotebookSessionQueryCompiler } from "../src/v2/notebook/notebook-session-query-compiler";

const record = {
	sessionId: "s1",
	cellOrder: ["c1"],
	activeCellId: "c1",
	commandHistory: [":help"],
	revision: 1,
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("V2 notebook session stores", () => {
	it("persists editor-only session state in KV with revision checks", async () => {
		const store = new KvNotebookSessionStore(new MemoryKvBackend());
		await store.save(record);
		expect(await store.get("s1")).toEqual(record);
		await expect(store.save({ ...record, revision: 2 }, 0)).rejects.toThrow(
			/revision mismatch/,
		);
		await store.save({ ...record, revision: 2 }, 1);
		expect((await store.get("s1"))?.revision).toBe(2);
	});

	it("uses the SQL query compiler AST for session persistence", () => {
		const compiler = new NotebookSessionQueryCompiler("sqlite");
		expect(compiler.getTableDDL("v2_notebook_sessions")[0]!.sql).toMatch(
			/CREATE TABLE/i,
		);
		expect(compiler.getQuery("s1", "v2_notebook_sessions").params).toContain(
			"s1",
		);
	});
});
