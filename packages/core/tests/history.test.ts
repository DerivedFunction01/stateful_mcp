import { describe, expect, test } from "bun:test";
import {
	HistoryConflictError,
	KvHistoryStore,
	KvHistoryResourceStore,
	MemoryKvBackend,
	SqlBackend,
	SqlExecutor,
	SqlHistoryStore,
	SqlHistoryResourceStore,
} from "../src/index";

const event = (eventId: string, value: unknown, streamId = "stream") => ({
	eventId,
	streamId,
	eventType: "fixture",
	occurredAt: "2026-01-01T00:00:00.000Z",
	payload: { value },
});

describe("history stores", () => {
	test("KV allocates sequences and supports idempotent appends", async () => {
		const store = new KvHistoryStore<{ value: number }>(
			new MemoryKvBackend(),
		);
		const first = await store.append("stream", event("a", 1));
		const duplicate = await store.append("stream", event("a", 1));
		const second = await store.append("stream", event("b", 2), 2);
		expect(first.sequence).toBe(1);
		expect(duplicate).toEqual(first);
		expect(second.sequence).toBe(2);
		await expect(
			store.append("stream", event("c", 3), 8),
		).rejects.toBeInstanceOf(HistoryConflictError);
		expect(
			(await store.read("stream")).events.map((item) => item.sequence),
		).toEqual([1, 2]);
	});

	test("SQL pushes cursor reads into the backend", async () => {
		const backend = await SqlBackend.connect("sqlite", ":memory:");
		const store = new SqlHistoryStore<{ value: number }>(
			new SqlExecutor(backend),
		);
		await store.append("stream", event("a", 1));
		await store.append("stream", event("b", 2));
		await store.append("other", event("c", 3, "other"));

		const result = await store.read("stream", { afterSequence: 1 });
		expect(result.events.map((item) => item.eventId)).toEqual(["b"]);
		expect(result.nextSequence).toBe(3);
	});

	test("KV resources explicitly create, save, open, list, and delete", async () => {
		const store = new KvHistoryResourceStore<{ value: number }>(
			new MemoryKvBackend(),
		);
		const resource = await store.create("repo-a", { kind: "repository" });
		resource.events.push({ ...event("a", 1), sequence: 1 });
		await store.save(resource);
		expect((await store.open("repo-a"))?.events).toHaveLength(1);
		expect(await store.list()).toHaveLength(1);
		await store.delete("repo-a");
		expect(await store.open("repo-a")).toBeNull();
	});

	test("SQL resources serialize complete history resources", async () => {
		const backend = await SqlBackend.connect("sqlite", ":memory:");
		const store = new SqlHistoryResourceStore<{ value: number }>(
			new SqlExecutor(backend),
		);
		const resource = await store.create("repo-a", { kind: "repository" });
		resource.events.push({ ...event("a", 1), sequence: 1 });
		await store.save(resource);
		const opened = await store.open("repo-a");
		expect(opened?.metadata).toEqual({ kind: "repository" });
		expect(opened?.events[0]?.eventId).toBe("a");
	});
});
