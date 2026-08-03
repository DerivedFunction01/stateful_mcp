import { describe, expect, it } from "bun:test";
import { MemoryKvBackend, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import type { MacroExecutionPlan } from "../src/v2/macros/macro-plan";
import { KvTransactionJournal } from "../src/v2/transactions/kv-transaction-journal";
import { SqlTransactionJournal } from "../src/v2/transactions/sql-transaction-journal";
import {
	InMemoryTransactionJournal,
	TransactionConflictError,
	TransactionCoordinator,
	TransactionIdempotencyError,
} from "../src/v2/transactions/transaction-coordinator";

const plan: MacroExecutionPlan = {
	groupId: "g1",
	scope: { kind: "composite", sessionId: "s1" },
	macroDefinitions: [{ macroId: "m1", macroName: "observation", version: 1 }],
	operations: [],
	links: [],
	generatedCells: [],
	expectedVersions: [
		{ aggregateKind: "document", aggregateId: "doc1", expectedVersion: 3 },
	],
	fingerprint: { value: "plan1", algorithm: "v2-plan-fingerprint-v1" },
	diagnostics: [],
};

function participant(
	id: string,
	kind: "clinical_events" | "workspace_events" | "projection",
	counters: { appends: number; projections: number },
	projectFails = false,
) {
	return {
		participantId: id,
		kind,
		appendEvents:
			kind === "projection"
				? undefined
				: async () => {
						counters.appends += 1;
						return { commitId: `${id}-commit`, eventIds: [`${id}-event`] };
					},
		project:
			kind === "projection"
				? async () => {
						counters.projections += 1;
						if (projectFails) throw new Error("projection unavailable");
					}
				: undefined,
	};
}

describe("V2 transaction coordinator", () => {
	it("rejects stale aggregate versions during prepare", async () => {
		const coordinator = new TransactionCoordinator({
			journal: new InMemoryTransactionJournal(),
			readAggregateVersion: async () => ({ version: 4 }),
			createTransactionId: () => "tx-stale",
		});

		await expect(
			coordinator.prepare({
				idempotencyKey: "idem-stale",
				sourceCellId: "cell1",
				sourceCellRevision: 1,
				plan,
				participants: [],
			}),
		).rejects.toBeInstanceOf(TransactionConflictError);
	});

	it("returns the same prepared transaction for a repeated idempotency key", async () => {
		const coordinator = new TransactionCoordinator({
			journal: new InMemoryTransactionJournal(),
			createTransactionId: () => "tx-idempotent",
		});
		const request = {
			idempotencyKey: "idem1",
			sourceCellId: "cell1",
			sourceCellRevision: 2,
			plan,
			participants: [],
		};
		const first = await coordinator.prepare(request);
		const second = await coordinator.prepare(request);

		expect(second.transactionId).toBe(first.transactionId);
		await expect(
			coordinator.prepare({
				...request,
				idempotencyKey: "idem1",
				plan: {
					...plan,
					fingerprint: { ...plan.fingerprint, value: "different" },
				},
			}),
		).rejects.toBeInstanceOf(TransactionIdempotencyError);
	});

	it("does not append duplicate event batches while recovering projection failure", async () => {
		const counters = { appends: 0, projections: 0 };
		const journal = new InMemoryTransactionJournal();
		const coordinator = new TransactionCoordinator({
			journal,
			createTransactionId: () => "tx-recovery",
		});
		const events = participant("clinical", "clinical_events", counters);
		let failProjection = true;
		const projection = {
			participantId: "projection",
			kind: "projection" as const,
			project: async () => {
				counters.projections += 1;
				if (failProjection) throw new Error("projection unavailable");
			},
		};
		const prepared = await coordinator.prepare({
			idempotencyKey: "idem2",
			sourceCellId: "cell1",
			sourceCellRevision: 1,
			plan,
			participants: [events, projection],
		});

		await expect(
			coordinator.commit(prepared.transactionId, [events, projection]),
		).rejects.toThrow("projection unavailable");
		expect((await coordinator.get(prepared.transactionId))?.status).toBe(
			"recovery_required",
		);
		failProjection = false;
		const recovered = await coordinator.recover(prepared.transactionId, [
			events,
			projection,
		]);

		expect(recovered.status).toBe("committed");
		expect(counters.appends).toBe(1);
		expect(counters.projections).toBe(2);
	});

	it("keeps clinical and workspace event streams under one transaction", async () => {
		const counters = { appends: 0, projections: 0 };
		const coordinator = new TransactionCoordinator({
			journal: new InMemoryTransactionJournal(),
			createTransactionId: () => "tx-composite",
		});
		const clinical = participant("clinical", "clinical_events", counters);
		const workspace = participant("workspace", "workspace_events", counters);
		const prepared = await coordinator.prepare({
			idempotencyKey: "idem3",
			sourceCellId: "cell1",
			sourceCellRevision: 1,
			plan,
			participants: [clinical, workspace],
		});
		const committed = await coordinator.commit(prepared.transactionId, [
			clinical,
			workspace,
		]);

		expect(committed.status).toBe("committed");
		expect(counters.appends).toBe(2);
		expect(
			(await coordinator.get(prepared.transactionId))?.participants.map(
				(item) => item.kind,
			),
		).toEqual(["clinical_events", "workspace_events"]);
	});

	it("rejects abort after events commit but allows abort before commit", async () => {
		const coordinator = new TransactionCoordinator({
			journal: new InMemoryTransactionJournal(),
			createTransactionId: () => "tx-abort",
		});
		const prepared = await coordinator.prepare({
			idempotencyKey: "idem-abort",
			sourceCellId: "cell1",
			sourceCellRevision: 1,
			plan,
			participants: [],
		});
		const aborted = await coordinator.abort(
			prepared.transactionId,
			"cancelled",
		);
		expect(aborted.status).toBe("aborted");
		await expect(
			coordinator.commit(prepared.transactionId, []),
		).rejects.toBeInstanceOf(TransactionConflictError);
	});

	it("persists deterministic transaction state in KV and SQL journals", async () => {
		const transaction = {
			transactionId: "tx-persisted",
			idempotencyKey: "idem-persisted",
			sourceCellId: "cell1",
			sourceCellRevision: 4,
			plan,
			status: "prepared" as const,
			participants: [],
			recoveryAttempts: 0,
			createdAt: "2026-08-03T00:00:00.000Z",
			updatedAt: "2026-08-03T00:00:00.000Z",
		};
		const kv = new KvTransactionJournal(new MemoryKvBackend());
		await kv.put(transaction);
		expect(await kv.get(transaction.transactionId)).toEqual(transaction);
		expect(await kv.list({ statuses: ["prepared"] })).toEqual([transaction]);

		const backend = await SqlBackend.connect("sqlite", ":memory:");
		const sql = new SqlTransactionJournal("sqlite", new SqlExecutor(backend));
		await sql.put(transaction);
		expect(await sql.getByIdempotencyKey(transaction.idempotencyKey)).toEqual(
			transaction,
		);
		expect(
			await sql.list({ sourceCellId: "cell1", statuses: ["prepared"] }),
		).toEqual([transaction]);
	});
});
