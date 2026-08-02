import { describe, expect, test } from "bun:test";
import { InMemorySyncCheckpointStore } from "../src/storage/checkpoints";
import type { CursorSyncSource, SyncRecord } from "../src/storage/contracts";
import { IncrementalSyncRunner, InMemorySyncTarget } from "../src/storage/sync";

function source(
	pages: Array<{ records: SyncRecord[]; nextCursor?: string }>,
): CursorSyncSource {
	let calls = 0;
	return {
		capabilities: () => ({ incrementalChanges: true, checkpoints: true }),
		snapshot: async function* (): AsyncIterableIterator<SyncRecord> {},
		changes: async function* (): AsyncIterableIterator<SyncRecord> {},
		changesPage: async () => pages[Math.min(calls++, pages.length - 1)]!,
	};
}

const record: SyncRecord = {
	sourceId: "remote",
	domain: "concepts",
	recordId: "c1",
	operation: "upsert",
	revision: "1",
	occurredAt: new Date().toISOString(),
	payload: { id: "c1" },
};

describe("incremental sync runner", () => {
	test("loads from the persisted cursor and writes the next cursor after apply", async () => {
		const checkpoints = new InMemorySyncCheckpointStore();
		await checkpoints.set({
			projectionId: "browser",
			sourceId: "remote",
			domain: "concepts",
			cursor: "cursor-1",
			status: "applied",
			updatedAt: new Date().toISOString(),
		});
		let receivedCursor: string | undefined;
		const upstream = source([{ records: [record], nextCursor: "cursor-2" }]);
		const original = upstream.changesPage;
		upstream.changesPage = async (cursor) => {
			receivedCursor = cursor;
			return original(cursor);
		};
		const result = await new IncrementalSyncRunner(
			upstream,
			new InMemorySyncTarget(),
			checkpoints,
		).pull({ projectionId: "browser", sourceId: "remote", domain: "concepts" });
		expect(receivedCursor).toBe("cursor-1");
		expect(result.nextCursor).toBe("cursor-2");
		expect(
			(await checkpoints.get("browser", "remote", "concepts"))?.cursor,
		).toBe("cursor-2");
	});

	test("retries source or target failure without advancing the old cursor", async () => {
		const checkpoints = new InMemorySyncCheckpointStore();
		await checkpoints.set({
			projectionId: "browser",
			sourceId: "remote",
			domain: "concepts",
			cursor: "cursor-1",
			status: "applied",
			updatedAt: new Date().toISOString(),
		});
		let calls = 0;
		const upstream = source([{ records: [record], nextCursor: "cursor-2" }]);
		upstream.changesPage = async () => {
			calls++;
			if (calls === 1) throw new Error("temporary failure");
			return { records: [record], nextCursor: "cursor-2" };
		};
		const result = await new IncrementalSyncRunner(
			upstream,
			new InMemorySyncTarget(),
			checkpoints,
		).pull({
			projectionId: "browser",
			sourceId: "remote",
			domain: "concepts",
			maxRetries: 1,
		});
		expect(result.attempts).toBe(2);
		expect(
			(await checkpoints.get("browser", "remote", "concepts"))?.status,
		).toBe("applied");
	});
});
