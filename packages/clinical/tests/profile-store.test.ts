import { describe, expect, test } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { KvProfileStore } from "../src/stores/profiles/kv-profile-store";

describe("unified profile stores", () => {
	test("persists and lists profiles through the KV backend", async () => {
		const store = new KvProfileStore(new MemoryKvBackend());
		await store.set({ profileId: "command-default", kind: "command", isDefault: true, payload: { directCommandToken: ":" } });
		await store.set({ profileId: "temporal-default", kind: "temporal", payload: { dateRecognitionRules: [] } });
		expect((await store.list()).map((profile) => profile.profileId)).toEqual(["command-default", "temporal-default"]);
		expect((await store.get("command-default"))?.kind).toBe("command");
	});
});
