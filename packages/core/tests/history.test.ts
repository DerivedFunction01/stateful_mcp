import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	HistoryConflictError,
	JsonHistoryStore,
	JsonlHistoryStore,
	MemoryHistoryStore,
} from "../src/index";

const event = (eventId: string, value: unknown) => ({
	eventId,
	streamId: "stream",
	eventType: "fixture",
	occurredAt: "2026-01-01T00:00:00.000Z",
	payload: { value },
});

describe("history stores", () => {
	test("allocates per-stream sequences and supports idempotent appends", async () => {
		const store = new MemoryHistoryStore<{ value: number }>();
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

	test("round trips JSON and JSONL stores", async () => {
		const directory = join(process.cwd(), ".tmp-history-tests");
		await mkdir(directory, { recursive: true });
		try {
			const json = new JsonHistoryStore(join(directory, "history.json"));
			const jsonl = new JsonlHistoryStore(join(directory, "history.jsonl"));
			await json.append("stream", event("a", { nested: true }));
			await jsonl.append("stream", event("a", { nested: true }));
			expect((await json.read("stream")).events).toEqual(
				(await jsonl.read("stream")).events,
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("reports a truncated JSONL final record without hiding valid events", async () => {
		const path = join(process.cwd(), ".tmp-history-partial.jsonl");
		await writeFile(
			path,
			`${JSON.stringify({ format: "stateful-history-jsonl", version: 1 })}\n${JSON.stringify({ ...event("a", 1), sequence: 1 })}\n{"eventId":"b"`,
			"utf8",
		);
		try {
			const store = new JsonlHistoryStore(path);
			const result = await store.read("stream");
			expect(result.events).toHaveLength(1);
			expect(
				result.diagnostics.some(
					(item) => item.code === "HISTORY_PARTIAL_RECORD",
				),
			).toBe(true);
		} finally {
			await rm(path, { force: true });
		}
	});

	test("treats a malformed newline-terminated record as non-recoverable", async () => {
		const path = join(process.cwd(), ".tmp-history-invalid.jsonl");
		await writeFile(
			path,
			`${JSON.stringify({ format: "stateful-history-jsonl", version: 1 })}\nnot-json\n`,
			"utf8",
		);
		try {
			const result = await new JsonlHistoryStore(path).read("stream");
			expect(
				result.diagnostics.some(
					(item) => item.code === "HISTORY_INVALID_JSON" && !item.recoverable,
				),
			).toBe(true);
		} finally {
			await rm(path, { force: true });
		}
	});
});
