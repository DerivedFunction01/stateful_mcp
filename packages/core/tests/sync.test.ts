import { describe, expect, test } from "bun:test";
import type { SyncRecord } from "../src/storage/contracts";
import {
	InMemorySyncMedium,
	InMemorySyncTarget,
	SyncOrchestrator,
} from "../src/storage/sync";

const record = (
	revision: string,
	operation: "upsert" | "delete" = "upsert",
): SyncRecord => ({
	sourceId: "remote",
	domain: "concepts",
	recordId: "c1",
	operation,
	revision,
	occurredAt: new Date().toISOString(),
	payload: { id: "c1" },
});

describe("sync orchestration", () => {
	test("round-trips records through an in-memory medium", async () => {
		const medium = new InMemorySyncMedium();
		await medium.write(
			(async function* () {
				yield record("1");
			})(),
		);
		const records: SyncRecord[] = [];
		for await (const value of medium.read()) records.push(value);
		expect(records).toHaveLength(1);
	});

	test("advances the cursor only after successful apply", async () => {
		const target = new InMemorySyncTarget();
		const orchestrator = new SyncOrchestrator(target);
		await orchestrator.apply(
			(async function* () {
				yield record("1");
			})(),
			{
				sourceId: "remote",
				domain: "concepts",
				nextCursor: "cursor-1",
			},
		);
		expect(orchestrator.getCheckpoint("remote", "concepts")?.cursor).toBe(
			"cursor-1",
		);
		expect(target.get("remote", "concepts", "c1")?.revision).toBe("1");
	});

	test("replay is idempotent and stale revisions are rejected", async () => {
		const target = new InMemorySyncTarget();
		await target.apply(
			(async function* () {
				yield record("2");
				yield record("1");
			})(),
		);
		const result = await target.apply(
			(async function* () {
				yield record("2");
			})(),
		);
		expect(result.rejected).toBe(1);
		expect(target.get("remote", "concepts", "c1")?.revision).toBe("2");
	});

	test("tombstones prevent older records from resurrecting data", async () => {
		const target = new InMemorySyncTarget();
		await target.apply(
			(async function* () {
				yield record("3", "delete");
			})(),
		);
		const result = await target.apply(
			(async function* () {
				yield record("2");
			})(),
		);
		expect(result.rejected).toBe(1);
		expect(target.get("remote", "concepts", "c1")).toBeNull();
		expect(target.getTombstone("remote", "concepts", "c1")?.revision).toBe("3");
	});
});
