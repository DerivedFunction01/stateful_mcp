import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { _PRIMARY_DIAGNOSIS_MACRO } from "../src/macros/default-macros";
import { KvMacroStore } from "../src/macros/kv-macro-store";
import { MacroQueryCompiler } from "../src/macros/macro-query-compiler";

describe(" durable macro stores", () => {
	it("persists and filters macro definitions through KV", async () => {
		const store = new KvMacroStore(new MemoryKvBackend());
		await store.set(_PRIMARY_DIAGNOSIS_MACRO);
		expect((await store.get("primary_diagnosis"))?.macroId).toBe(
			"v2-primary-diagnosis-1",
		);
		expect((await store.list()).map((macro) => macro.macroName)).toEqual([
			"primary_diagnosis",
		]);
	});

	it("compiles SQL DDL and AST queries without string-built SQL", () => {
		const compiler = new MacroQueryCompiler("sqlite");
		const ddl = compiler.getTableDDL("v2_macros")[0]!;
		const query = compiler.getQuery("primary_diagnosis", "v2_macros", {
			profileId: "default",
		});
		expect(ddl.sql).toMatch(/CREATE TABLE/i);
		expect(query.sql).toMatch(/SELECT/i);
		expect(query.params).toContain("primary_diagnosis");
	});
});
