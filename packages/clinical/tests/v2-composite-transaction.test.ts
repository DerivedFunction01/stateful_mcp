import { describe, expect, it } from "bun:test";
import {
	createEventStore,
	EventStore,
	MemoryKvBackend,
} from "@stateful-mcp/core";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";
import { ClinicalDocumentService } from "../src/v2/clinical/clinical-document-service";
import {
	InMemoryClinicalDocumentProjectionStore,
	InMemorySignedDocumentArchive,
} from "../src/v2/clinical/clinical-document-types";
import { ClinicalOperationCompiler } from "../src/v2/clinical/clinical-operation-compiler";
import { ClinicalTransactionParticipant } from "../src/v2/clinical/clinical-transaction-participant";
import { enrichPlanWithCompletionLinkage } from "../src/v2/clinical/composite-clinical-linkage";
import { CoreClinicalEventStore } from "../src/v2/clinical/core-clinical-event-store";
import { registerClinicalSchemaAdapters } from "../src/v2/clinical/register-clinical-schema-adapters";
import type { MacroExecutionPlan } from "../src/v2/macros/macro-plan";
import {
	differentialDiagnosisSchema,
	primaryDiagnosisSchema,
} from "../src/v2/schemas/definitions/assessment-schema";
import { SchemaRegistry } from "../src/v2/schemas/schema-registry";
import {
	InMemoryTransactionJournal,
	TransactionCoordinator,
} from "../src/v2/transactions/transaction-coordinator";
import { CoreWorkspaceEventStore } from "../src/v2/workspaces/core-workspace-event-store";
import { KvWorkspaceStore } from "../src/v2/workspaces/kv-workspace-store";
import { WorkspaceService } from "../src/v2/workspaces/workspace-service";
import { WorkspaceTransactionParticipant } from "../src/v2/workspaces/workspace-transaction-participant";

async function clinicalSetup() {
	const schemas = new SchemaRegistry();
	schemas.register(primaryDiagnosisSchema);
	schemas.register(differentialDiagnosisSchema);
	const adapters = registerClinicalSchemaAdapters(schemas);
	const storage = await createEventStore(new SimpleMemoryKvBackend());
	const eventStore = new EventStore({
		session: storage,
		persistent: storage,
		schemas: new Map(),
	});
	const service = new ClinicalDocumentService(
		new CoreClinicalEventStore(eventStore),
		new ClinicalOperationCompiler(adapters),
		new InMemoryClinicalDocumentProjectionStore(),
		new InMemorySignedDocumentArchive(),
	);
	return service;
}

async function workspaceSetup() {
	const pair = {
		backend: new MemoryKvBackend(),
		eventBackend: new SimpleMemoryKvBackend(),
	};
	const storage = await createEventStore(pair.eventBackend);
	const eventStore = new EventStore({
		session: storage,
		persistent: storage,
		schemas: new Map(),
	});
	const service = new WorkspaceService(
		new KvWorkspaceStore(pair.backend),
		new CoreWorkspaceEventStore(eventStore),
	);
	return service;
}

describe("V2 composite transaction completion linkage", () => {
	it("enriches a composite plan with completion-derived clinical operations", async () => {
		const workspaceService = await workspaceSetup();
		const workspace = await workspaceService.createWorkspace({
			sessionId: "s1",
			sourceDocumentId: "doc-1",
			workspaceId: "ws-comp",
			initialBranches: [
				{
					name: "Pneumonia",
					hypothesisConcept: { conceptId: "C1", display: "Pneumonia" },
				},
				{
					name: "Bronchitis",
					hypothesisConcept: { conceptId: "C2", display: "Bronchitis" },
				},
			],
		});
		await workspaceService.applyOperations(
			workspace.id,
			[
				{
					kind: "branch_transition",
					workspaceId: workspace.id,
					branchId: workspace.branches[0]!.id,
					transition: "confirm",
				},
			],
			workspace.version,
			workspace.eventHead,
		);
		const current = (await workspaceService.getWorkspace(workspace.id))!;

		const base: MacroExecutionPlan = {
			groupId: "comp-group",
			scope: {
				kind: "composite",
				sessionId: "s1",
				documentId: "doc-1",
				workspaceId: current.id,
			},
			macroDefinitions: [],
			operations: [],
			links: [],
			generatedCells: [],
			workspaceOperations: [
				{
					kind: "complete",
					workspaceId: current.id,
					winningBranchId: current.branches[0]!.id,
				},
			],
			expectedVersions: [],
			fingerprint: {
				value: "comp-plan-1",
				algorithm: "v2-plan-fingerprint-v1",
			},
			diagnostics: [],
		};

		const enriched = enrichPlanWithCompletionLinkage(base, current);
		expect(enriched.clinicalOperations?.length).toBeGreaterThan(0);

		const primary = enriched.clinicalOperations!.find(
			(op) => op.schemaName === "PrimaryDiagnosis",
		);
		expect(primary?.kind).toBe("record_upserted");
	});

	it("does not enrich when no workspace completion is present", async () => {
		const workspaceService = await workspaceSetup();
		const workspace = await workspaceService.createWorkspace({
			sessionId: "s2",
			sourceDocumentId: "doc-2",
			workspaceId: "ws-noop",
		});
		const base: MacroExecutionPlan = {
			groupId: "noop-group",
			scope: {
				kind: "composite",
				sessionId: "s2",
				documentId: "doc-2",
				workspaceId: workspace.id,
			},
			macroDefinitions: [],
			operations: [],
			links: [],
			generatedCells: [],
			workspaceOperations: [{ kind: "close", workspaceId: workspace.id }],
			expectedVersions: [],
			fingerprint: {
				value: "noop-plan-1",
				algorithm: "v2-plan-fingerprint-v1",
			},
			diagnostics: [],
		};
		expect(enrichPlanWithCompletionLinkage(base, workspace)).toBe(base);
	});

	it("commits workspace completion and clinical diagnosis records in one transaction", async () => {
		const workspaceService = await workspaceSetup();
		const clinicalService = await clinicalSetup();
		const workspace = await workspaceService.createWorkspace({
			sessionId: "s3",
			sourceDocumentId: "doc-3",
			workspaceId: "ws-tx",
			initialBranches: [
				{
					name: "Migraine",
					hypothesisConcept: { conceptId: "M1", display: "Migraine" },
				},
			],
		});
		await workspaceService.applyOperations(
			workspace.id,
			[
				{
					kind: "branch_transition",
					workspaceId: workspace.id,
					branchId: workspace.branches[0]!.id,
					transition: "confirm",
				},
			],
			workspace.version,
			workspace.eventHead,
		);
		const current = (await workspaceService.getWorkspace(workspace.id))!;
		const doc = await clinicalService.initDocument({
			kind: "document_initialized",
			documentId: "doc-3",
			sessionId: "s3",
			patientId: "p3",
		});

		const plan = enrichPlanWithCompletionLinkage(
			{
				groupId: "tx-group",
				scope: {
					kind: "composite",
					sessionId: "s3",
					documentId: "doc-3",
					workspaceId: current.id,
				},
				macroDefinitions: [],
				operations: [],
				links: [],
				generatedCells: [],
				workspaceOperations: [
					{
						kind: "complete",
						workspaceId: current.id,
						winningBranchId: current.branches[0]!.id,
					},
				],
				expectedVersions: [
					{
						aggregateKind: "document",
						aggregateId: "doc-3",
						expectedVersion: doc.version,
						expectedHead: doc.eventHead,
					},
					{
						aggregateKind: "workspace",
						aggregateId: current.id,
						expectedVersion: current.version,
						expectedHead: current.eventHead,
					},
				],
				fingerprint: {
					value: "tx-plan-1",
					algorithm: "v2-plan-fingerprint-v1",
				},
				diagnostics: [],
			},
			current,
		);

		const coordinator = new TransactionCoordinator({
			journal: new InMemoryTransactionJournal(),
		});
		const wsParticipant = new WorkspaceTransactionParticipant(workspaceService);
		const docParticipant = new ClinicalTransactionParticipant(clinicalService);
		const prepared = await coordinator.prepare({
			idempotencyKey: "comp-tx-1",
			sourceCellId: "cell-1",
			sourceCellRevision: 1,
			plan,
			participants: [wsParticipant, docParticipant],
		});
		await coordinator.commit(prepared.transactionId, [
			wsParticipant,
			docParticipant,
		]);

		const docState = await clinicalService.getDocument("doc-3");
		const primary = Object.values(docState?.records ?? {}).find(
			(record) => record.schemaName === "PrimaryDiagnosis",
		);
		expect(primary?.values.diagnosis).toBeDefined();
		expect(docState?.status).toBe("draft");
	});
});
