import { describe, expect, test } from "bun:test";
import { createRepo } from "../src/adapters/storage/shared/unified-repo";
import { MemoryKvBackend } from "../src/adapters/storage/simple/memory/backend";
import { PermissionedSimpleKvBackend } from "../src/adapters/storage/simple/permissioned-kv-backend";
import { SqlBackend } from "../src/adapters/storage/sql/backend";
import { InMemorySyncCheckpointStore } from "../src/storage/checkpoints";
import type { SyncRecord } from "../src/storage/contracts";
import {
	IncrementalSyncRunner,
	InMemorySyncTarget,
	PermissionedSyncTarget,
} from "../src/storage/sync";

const syncRecord: SyncRecord = {
	sourceId: "source",
	domain: "objects",
	recordId: "one",
	operation: "upsert",
	revision: "1",
	occurredAt: new Date().toISOString(),
	payload: { value: 1 },
};

describe("centralized storage permissions", () => {
	test("suppresses simple KV writes while preserving reads", async () => {
		const raw = new MemoryKvBackend();
		await raw.setPersistentState("one", { level: "global" }, { value: 1 });
		const readOnly = new PermissionedSimpleKvBackend(raw, {
			permissions: { read: true, write: false, delete: false },
		});
		await readOnly.setPersistentState("one", { level: "global" }, { value: 2 });
		expect(
			await readOnly.getPersistentState("one", { level: "global" }),
		).toEqual({ value: 1 });
		expect(readOnly.diagnostics.lastStatus).toBe("skipped_read_only");
		expect(readOnly.diagnostics.suppressedCount).toBe(1);
	});

	test("prevents SQL writes before reaching the driver", async () => {
		const backend = await SqlBackend.connect("sqlite", ":memory:");
		await backend.exec(
			"CREATE TABLE permission_test (id TEXT PRIMARY KEY, value INTEGER)",
		);
		backend.setPermissionPolicy({ permissions: { read: true, write: false } });
		await backend.exec(
			"INSERT INTO permission_test (id, value) VALUES (?, ?)",
			["one", 1],
		);
		expect(backend.diagnostics.lastStatus).toBe("skipped_read_only");
		const rows = await backend.query("SELECT * FROM permission_test");
		expect(rows).toHaveLength(0);
	});

	test("does not advance sync cursors when sync writes are suppressed", async () => {
		const checkpoints = new InMemorySyncCheckpointStore();
		const source = {
			capabilities: () => ({ incrementalChanges: true }),
			snapshot: async function* () {},
			changes: async function* () {},
			changesPage: async () => ({
				records: [syncRecord],
				nextCursor: "cursor-2",
			}),
		};
		const result = await new IncrementalSyncRunner(
			source,
			new PermissionedSyncTarget(new InMemorySyncTarget(), {
				permissions: { syncWrite: false },
			}),
			checkpoints,
		).pull({ projectionId: "local", sourceId: "source", domain: "objects" });
		expect(result.status).toBe("skipped_read_only");
		expect(result.nextCursor).toBeUndefined();
		expect((await checkpoints.get("local", "source", "objects"))?.status).toBe(
			"skipped",
		);
	});

	test("applies storage_runtime permissions at repository initialization", async () => {
		const repo = await createRepo({
			storageRuntime: {
				object: {
					persistent: {
						scope: {
							global: {
								projection: {
									locator: { _type: "adapter", name: "memory" },
									role: "projection",
									permissions: { read: true, write: false },
								},
							},
						},
					},
				},
			},
		});
		await repo.persistentObject!.set("one", { objectId: "one" } as any, {
			level: "global",
		});
		expect(
			await repo.persistentObject!.get("one", { level: "global" }),
		).toBeNull();
	});
});
