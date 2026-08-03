import { describe, expect, it } from "bun:test";
import {
	createEventStore,
	EventStore,
	MemoryKvBackend,
} from "@stateful-mcp/core";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";
import type { MacroExecutionPlan } from "../src/v2/macros/macro-plan";
import { TransactionCoordinator } from "../src/v2/transactions/transaction-coordinator";
import { CoreWorkspaceEventStore } from "../src/v2/workspaces/core-workspace-event-store";
import { KvWorkspaceStore } from "../src/v2/workspaces/kv-workspace-store";
import type { WorkspaceEventStore } from "../src/v2/workspaces/workspace-event-store";
import {
	WorkspaceConflictError,
	WorkspaceService,
} from "../src/v2/workspaces/workspace-service";
import type { WorkspaceStore } from "../src/v2/workspaces/workspace-store";
import { WorkspaceTransactionParticipant } from "../src/v2/workspaces/workspace-transaction-participant";

type BackendPair = { store: WorkspaceStore; events: WorkspaceEventStore };

async function corePair(): Promise<BackendPair> {
	const backend = new MemoryKvBackend();
	const eventBackend = new SimpleMemoryKvBackend();
	const storage = await createEventStore(eventBackend);
	const eventStore = new EventStore({
		session: storage,
		persistent: storage,
		schemas: new Map(),
	});
	return {
		store: new KvWorkspaceStore(backend),
		events: new CoreWorkspaceEventStore(eventStore),
	};
}

describe("V2 workspace service with core DAG event store", () => {
	it("creates a workspace and records an initialization event", async () => {
		const pair = await corePair();
		const service = new WorkspaceService(pair.store, pair.events);
		const workspace = await service.createWorkspace({
			sessionId: "session-1",
			sourceDocumentId: "document-1",
			workspaceId: "workspace-1",
			initialBranches: [
				{
					name: "Chest pain",
					hypothesisConcept: { conceptId: "chest-pain", display: "Chest pain" },
				},
			],
		});

		expect(workspace.version).toBe(1);
		expect(workspace.activeBranchId).toBeTruthy();
		expect(
			(
				await pair.events.project(
					workspace.id,
					workspace.sessionId,
					workspace.eventHead!,
				)
			).length,
		).toBe(1);
	});

	it("applies typed operations and rebuilds the projection from events", async () => {
		const pair = await corePair();
		const service = new WorkspaceService(pair.store, pair.events);
		const created = await service.createWorkspace({
			sessionId: "session-1",
			sourceDocumentId: "document-1",
			workspaceId: "workspace-2",
		});
		const branchId = created.activeBranchId!;
		const updated = await service.applyOperations(
			created.id,
			[
				{
					kind: "add_fact",
					workspaceId: created.id,
					branchId,
					fact: {
						factId: "fact-1",
						targetSchema: "ObservationEvent",
						concept: { conceptId: "pain", display: "Pain" },
						certainty: "supporting",
						provenance: {},
					},
				},
				{
					kind: "branch_transition",
					workspaceId: created.id,
					branchId,
					transition: "confirm",
				},
				{ kind: "close", workspaceId: created.id },
			],
			created.version,
		);

		expect(updated.version).toBe(4);
		expect(updated.branches[0]?.status).toBe("confirmed");
		expect(updated.branches[0]?.supportingConcepts[0]?.conceptId).toBe("pain");
		expect(updated.closeRequested).toBe(true);
		const rebuilt = await service.rebuildFromEvents(created.id);
		expect(rebuilt).toEqual(updated);
	});

	it("rejects stale versions and invalid transitions", async () => {
		const pair = await corePair();
		const service = new WorkspaceService(pair.store, pair.events);
		const created = await service.createWorkspace({
			sessionId: "session-1",
			sourceDocumentId: "document-1",
		});

		await expect(
			service.applyOperations(
				created.id,
				[{ kind: "close", workspaceId: created.id }],
				99,
			),
		).rejects.toBeInstanceOf(WorkspaceConflictError);
		await expect(
			service.applyOperations(
				created.id,
				[
					{
						kind: "branch_transition",
						workspaceId: created.id,
						branchId: created.activeBranchId!,
						transition: "reactivate",
					},
				],
				created.version,
			),
		).rejects.toThrow("invalid");
	});

	it("supports event idempotency without duplicate records", async () => {
		const pair = await corePair();
		const service = new WorkspaceService(pair.store, pair.events);
		const created = await service.createWorkspace({
			sessionId: "session-1",
			sourceDocumentId: "document-1",
			workspaceId: "workspace-idempotent",
		});
		const event = {
			kind: "workspace_close_requested" as const,
			workspaceId: created.id,
		};
		const first = await pair.events.append(
			created.id,
			created.sessionId,
			created.eventHead!,
			[event],
			"tx-1",
			"idem-1",
		);
		const second = await pair.events.append(
			created.id,
			created.sessionId,
			created.eventHead!,
			[event],
			"tx-1",
			"idem-1",
		);

		expect(second).toEqual(first);
		expect(
			(await pair.events.project(created.id, created.sessionId, first.commitId))
				.length,
		).toBe(2);
	});
});

describe("V2 workspace transaction participant", () => {
	it("preserves parallel heads and merges them through the core DAG", async () => {
		const pair = await corePair();
		const root = await new WorkspaceService(
			pair.store,
			pair.events,
		).createWorkspace({
			sessionId: "session-merge",
			sourceDocumentId: "document-merge",
			workspaceId: "workspace-merge",
		});
		const branchA = await pair.events.append(
			root.id,
			root.sessionId,
			root.eventHead!,
			[
				{
					kind: "global_fact_added",
					workspaceId: root.id,
					fact: {
						factId: "fact-a",
						targetSchema: "ObservationEvent",
						certainty: "neutral",
						provenance: {},
					},
				},
			],
		);
		const branchB = await pair.events.append(
			root.id,
			root.sessionId,
			root.eventHead!,
			[
				{
					kind: "global_fact_added",
					workspaceId: root.id,
					fact: {
						factId: "fact-b",
						targetSchema: "ObservationEvent",
						certainty: "neutral",
						provenance: {},
					},
				},
			],
		);
		const merged = await pair.events.merge(root.sessionId, branchA.commitId, [
			branchB.commitId,
		]);

		expect(merged.status).toBe("clean");
		expect(merged.commitId).toBeTruthy();
		const projected = await pair.events.project(
			root.id,
			root.sessionId,
			merged.commitId!,
		);
		expect(
			projected.some(
				(record) =>
					record.payload.kind === "global_fact_added" &&
					record.payload.fact.factId === "fact-a",
			),
		).toBe(true);
		expect(
			projected.some(
				(record) =>
					record.payload.kind === "global_fact_added" &&
					record.payload.fact.factId === "fact-b",
			),
		).toBe(true);
	});

	it("keeps lifecycle history append-only and detects conflicting transitions by logical key", async () => {
		const pair = await corePair();
		const service = new WorkspaceService(pair.store, pair.events);
		const root = await service.createWorkspace({
			sessionId: "session-conflict",
			sourceDocumentId: "document-conflict",
			workspaceId: "workspace-conflict",
		});
		const branchId = root.activeBranchId!;
		const confirmed = await pair.events.append(
			root.id,
			root.sessionId,
			root.eventHead!,
			[
				{
					kind: "branch_lifecycle_transitioned",
					workspaceId: root.id,
					branchId,
					fromStatus: "active",
					toStatus: "confirmed",
					reason: "confirmed by user A",
					metadata: { logicalKey: `branch:${branchId}` },
				},
			],
		);
		const ruledOut = await pair.events.append(
			root.id,
			root.sessionId,
			root.eventHead!,
			[
				{
					kind: "branch_lifecycle_transitioned",
					workspaceId: root.id,
					branchId,
					fromStatus: "active",
					toStatus: "ruled_out",
					reason: "ruled out by user B",
					metadata: { logicalKey: `branch:${branchId}` },
				},
			],
		);

		const beforeDecision = await pair.events.project(
			root.id,
			root.sessionId,
			root.eventHead!,
		);
		const afterDecision = await pair.events.project(
			root.id,
			root.sessionId,
			confirmed.commitId,
		);
		const merge = await pair.events.merge(root.sessionId, confirmed.commitId, [
			ruledOut.commitId,
		]);

		expect(
			beforeDecision.some(
				(record) => record.payload.kind === "branch_lifecycle_transitioned",
			),
		).toBe(false);
		expect(
			afterDecision.some(
				(record) =>
					record.payload.kind === "branch_lifecycle_transitioned" &&
					record.payload.toStatus === "confirmed",
			),
		).toBe(true);
		expect(merge.status).toBe("conflict");
		expect(merge.conflicts?.[0]?.logicalKey).toBe(`branch:${branchId}`);
	});

	it("voids a mistaken command in a new commit without changing history", async () => {
		const pair = await corePair();
		const service = new WorkspaceService(pair.store, pair.events);
		const root = await service.createWorkspace({
			sessionId: "session-void",
			sourceDocumentId: "document-void",
			workspaceId: "workspace-void",
		});
		const ruledOut = await service.applyOperations(
			root.id,
			[
				{
					kind: "branch_transition",
					workspaceId: root.id,
					branchId: root.activeBranchId!,
					transition: "rule_out",
					reason: "wrong branch",
				},
			],
			root.version,
			root.eventHead,
		);
		const command = (
			await pair.events.project(root.id, root.sessionId, ruledOut.eventHead!)
		).find((record) => record.payload.kind === "branch_lifecycle_transitioned");
		expect(command).toBeTruthy();
		const corrected = await service.voidEvent(
			root.id,
			command!.eventId,
			ruledOut.eventHead!,
			"Clinician selected the wrong branch",
			"clinician-1",
		);
		const beforeCorrection = await pair.events.project(
			root.id,
			root.sessionId,
			ruledOut.eventHead!,
		);
		const afterCorrection = await pair.events.project(
			root.id,
			root.sessionId,
			corrected.eventHead!,
		);

		expect(
			beforeCorrection.some(
				(record) =>
					record.payload.kind === "branch_lifecycle_transitioned" &&
					!record.voided,
			),
		).toBe(true);
		expect(
			afterCorrection.some(
				(record) => record.eventId === command!.eventId && record.voided,
			),
		).toBe(true);
		expect(corrected.branches[0]?.status).toBe("active");
	});

	it("resolves branch references deterministically and preserves aliases", async () => {
		const pair = await corePair();
		const service = new WorkspaceService(pair.store, pair.events);
		const root = await service.createWorkspace({
			sessionId: "session-alias",
			sourceDocumentId: "document-alias",
			workspaceId: "workspace-alias",
		});
		const created = await service.applyOperations(
			root.id,
			[
				{
					kind: "create_branch",
					workspaceId: root.id,
					name: "Pulmonary embolism",
					commandAlias: "pe",
					concept: { conceptId: "pe", display: "Pulmonary embolism" },
				},
			],
			root.version,
			root.eventHead,
		);
		const focused = await service.applyOperations(
			root.id,
			[{ kind: "focus_branch", workspaceId: root.id, branchId: "pe" }],
			created.version,
			created.eventHead,
		);

		expect(focused.activeBranchId).toBe(
			focused.branches.find((branch) => branch.commandAlias === "pe")?.id,
		);
		await expect(
			service.applyOperations(
				root.id,
				[{ kind: "focus_branch", workspaceId: root.id, branchId: "missing" }],
				focused.version,
				focused.eventHead,
			),
		).rejects.toMatchObject({ diagnosticCode: "missing_branch" });
	});

	it("commits workspace operations through the transaction coordinator", async () => {
		const pair = await corePair();
		const service = new WorkspaceService(pair.store, pair.events);
		const created = await service.createWorkspace({
			sessionId: "session-1",
			sourceDocumentId: "document-1",
			workspaceId: "workspace-transaction",
		});
		const plan: MacroExecutionPlan = {
			groupId: "group-1",
			scope: {
				kind: "workspace",
				sessionId: "session-1",
				workspaceId: created.id,
			},
			macroDefinitions: [],
			operations: [],
			links: [],
			generatedCells: [],
			workspaceOperations: [{ kind: "close", workspaceId: created.id }],
			expectedVersions: [
				{
					aggregateKind: "workspace",
					aggregateId: created.id,
					expectedVersion: created.version,
				},
			],
			fingerprint: {
				value: "workspace-plan-1",
				algorithm: "v2-plan-fingerprint-v1",
			},
			diagnostics: [],
		};
		const coordinator = new TransactionCoordinator({
			journal: new (
				await import("../src/v2/transactions/transaction-coordinator")
			).InMemoryTransactionJournal(),
		});
		const participant = new WorkspaceTransactionParticipant(service);
		const prepared = await coordinator.prepare({
			idempotencyKey: "workspace-tx-1",
			sourceCellId: "cell-1",
			sourceCellRevision: 1,
			plan,
			participants: [participant],
		});
		const committed = await coordinator.commit(prepared.transactionId, [
			participant,
		]);

		expect(committed.status).toBe("committed");
		expect((await service.getWorkspace(created.id))?.closeRequested).toBe(true);
		expect(
			(
				await pair.events.project(
					created.id,
					created.sessionId,
					(await service.getWorkspace(created.id))!.eventHead!,
				)
			).length,
		).toBe(2);
	});
});
