import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { KvCellStore } from "../src/cells/kv-cell-store";

describe("KvCellStore", () => {
	it("does not deserialize other session-scoped records as cells", async () => {
		const backend = new MemoryKvBackend();
		await backend.set(
			"v2:workspace:workspace-1",
			JSON.stringify({
				id: "workspace-1",
				sessionId: "session-1",
				branches: [],
			}),
		);
		await backend.save();
		const store = new KvCellStore(backend);
		expect(await store.list("session-1")).toEqual([]);
	});
});
