import { beforeAll, describe, expect, test } from "bun:test";
import {
	IndexedDbPersistentStore,
	IndexedDbSessionStore,
	LocalStoragePersistentStore,
	LocalStorageSessionStore,
} from "../src/adapters/storage/old/browser-repo";
import { installBrowserMocks } from "../src/adapters/storage/shared/test-mocks";

describe("Browser Storage Adapters", () => {
	beforeAll(() => {
		installBrowserMocks();
	});

	describe("LocalStorage Adapters", () => {
		const sessionStore = new LocalStorageSessionStore();
		const persistentStore = new LocalStoragePersistentStore();
		const sessionId = "sess-local";

		test("Create and read session state", async () => {
			const state = { objectId: "", value: "hello" };
			const id = await sessionStore.create(sessionId, state, "my-alias");
			expect(id).toBeDefined();

			const retrieved = await sessionStore.get(sessionId, id);
			expect(retrieved.value).toBe("hello");

			const resolvedId = await sessionStore.getAlias(sessionId, "my-alias");
			expect(resolvedId).toBe(id);
		});

		test("Create and read persistent state", async () => {
			const state = { id: "global-state", val: 42 };
			await persistentStore.set("global-state", state, { level: "global" });

			const retrieved = await persistentStore.get("global-state", {
				level: "global",
			});
			expect(retrieved.val).toBe(42);
		});

		test("Expire session older than threshold", async () => {
			const state = {
				objectId: "",
				value: "hello",
				timestamp: new Date(Date.now() - 5000).toISOString(),
			};
			const id = await sessionStore.create(sessionId, state, "temp-alias");

			await sessionStore.expireSession(sessionId, 1000);
			const retrieved = await sessionStore.get(sessionId, id);
			expect(retrieved).toBeNull();
		});
	});

	describe("IndexedDB Adapters", () => {
		const sessionStore = new IndexedDbSessionStore("test-db");
		const persistentStore = new IndexedDbPersistentStore("test-db");
		const sessionId = "sess-idb";

		test("Create and read session state", async () => {
			const state = { objectId: "", value: "idb-hello" };
			const id = await sessionStore.create(sessionId, state, "idb-alias");
			expect(id).toBeDefined();

			const retrieved = await sessionStore.get(sessionId, id);
			expect(retrieved.value).toBe("idb-hello");

			const resolvedId = await sessionStore.getAlias(sessionId, "idb-alias");
			expect(resolvedId).toBe(id);
		});

		test("Create and read persistent state", async () => {
			const state = { id: "p-state", val: 100 };
			await persistentStore.set("p-state", state, { level: "global" });

			const retrieved = await persistentStore.get("p-state", {
				level: "global",
			});
			expect(retrieved.val).toBe(100);
		});

		test("Expire session older than threshold", async () => {
			const state = {
				objectId: "",
				value: "idb-hello",
				timestamp: new Date(Date.now() - 5000).toISOString(),
			};
			const id = await sessionStore.create(sessionId, state, "idb-temp-alias");

			await sessionStore.expireSession(sessionId, 1000);
			const retrieved = await sessionStore.get(sessionId, id);
			expect(retrieved).toBeNull();
		});
	});
});
