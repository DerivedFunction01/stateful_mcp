import type { MacroExecutionPlan } from "../macros/macro-plan";
import type { WorkspaceEventStore } from "./workspace-event-store";
import type {
	WorkspaceEvent,
	WorkspaceEventRecord,
} from "./workspace-event-types";
import { createWorkspace } from "./workspace-factory";
import {
	reduceWorkspaceEvent,
	reduceWorkspaceEvents,
} from "./workspace-reducer";
import type { WorkspaceSnapshot } from "./workspace-snapshot";
import type { WorkspaceStore } from "./workspace-store";
import type {
	Branch,
	CreateWorkspaceRequest,
	TypedFact,
	WorkspaceAggregate,
	WorkspaceOperation,
} from "./workspace-types";

export class WorkspaceConflictError extends Error {
	readonly code = "WORKSPACE_CONFLICT";
}

export class WorkspaceOperationError extends Error {
	readonly code = "WORKSPACE_OPERATION_INVALID";
	readonly diagnosticCode: WorkspaceDiagnosticCode;

	constructor(
		message: string,
		diagnosticCode: WorkspaceDiagnosticCode = "unsupported_transition",
	) {
		super(message);
		this.diagnosticCode = diagnosticCode;
	}
}

export type WorkspaceDiagnosticCode =
	| "malformed_input"
	| "unknown_alias"
	| "missing_branch"
	| "ambiguous_branch"
	| "unsupported_transition"
	| "no_workspace_context";

export interface WorkspaceServiceContract {
	createWorkspace(request: CreateWorkspaceRequest): Promise<WorkspaceAggregate>;
	getWorkspace(workspaceId: string): Promise<WorkspaceAggregate | null>;
	listWorkspaces(sessionId: string): Promise<WorkspaceAggregate[]>;
	applyOperations(
		workspaceId: string,
		operations: WorkspaceOperation[],
		expectedVersion: number,
		expectedHead?: string,
		transactionId?: string,
		idempotencyKey?: string,
	): Promise<WorkspaceAggregate>;
	getSnapshot(workspaceId: string): Promise<WorkspaceSnapshot | null>;
	rebuildFromEvents(workspaceId: string): Promise<WorkspaceAggregate | null>;
	voidEvent(
		workspaceId: string,
		eventId: string,
		expectedHead: string,
		reason: string,
		actorId?: string,
	): Promise<WorkspaceAggregate>;
	ingestFact(
		workspaceId: string,
		fact: TypedFact,
		expectedVersion: number,
		branchRef?: string,
		expectedHead?: string,
	): Promise<WorkspaceAggregate>;
}

export interface PreparedWorkspaceMutation {
	workspaceId: string;
	baseVersion: number;
	aggregate: WorkspaceAggregate;
	events: WorkspaceEvent[];
}

export class WorkspaceService implements WorkspaceServiceContract {
	constructor(
		private readonly store: WorkspaceStore,
		private readonly events: WorkspaceEventStore,
	) {}

	async createWorkspace(
		request: CreateWorkspaceRequest,
	): Promise<WorkspaceAggregate> {
		const aggregate = createWorkspace(request);
		const initialized: WorkspaceEvent = {
			kind: "workspace_initialized",
			workspaceId: aggregate.id,
			sessionId: aggregate.sessionId,
			sourceDocumentId: aggregate.sourceDocumentId,
			branches: aggregate.branches,
			activeBranchId: aggregate.activeBranchId ?? "",
			globalFacts: aggregate.globalFacts,
			metadata: { logicalKey: "workspace:root" },
		};
		const committed = await this.events.initialize(
			aggregate.id,
			aggregate.sessionId,
			initialized,
		);
		const projected = reduceWorkspaceEvents(committed.records);
		projected.eventHead = committed.commitId;
		await this.store.save(projected);
		return projected;
	}

	getWorkspace(workspaceId: string): Promise<WorkspaceAggregate | null> {
		return this.store.get(workspaceId);
	}

	listWorkspaces(sessionId: string): Promise<WorkspaceAggregate[]> {
		return this.store.list(sessionId);
	}

	async applyOperations(
		workspaceId: string,
		operations: WorkspaceOperation[],
		expectedVersion: number,
		expectedHead?: string,
		transactionId?: string,
		idempotencyKey?: string,
	): Promise<WorkspaceAggregate> {
		const aggregate = await this.requireWorkspace(workspaceId);
		if (aggregate.version !== expectedVersion)
			throw new WorkspaceConflictError(
				`Workspace '${workspaceId}' version mismatch: expected ${expectedVersion}, actual ${aggregate.version}`,
			);
		if (expectedHead && aggregate.eventHead !== expectedHead)
			throw new WorkspaceConflictError(
				`Workspace '${workspaceId}' head mismatch: expected ${expectedHead}, actual ${aggregate.eventHead ?? "none"}`,
			);
		const planned = this.planOperations(aggregate, operations);
		if (!planned.events.length) return aggregate;
		const committed = await this.events.append(
			workspaceId,
			aggregate.sessionId,
			aggregate.eventHead ?? "",
			planned.events,
			transactionId,
			idempotencyKey,
		);
		const records = await this.events.project(
			workspaceId,
			aggregate.sessionId,
			committed.commitId,
		);
		const projected = reduceWorkspaceEvents(records);
		projected.eventHead = committed.commitId;
		await this.store.save(projected);
		return projected;
	}

	async getSnapshot(workspaceId: string): Promise<WorkspaceSnapshot | null> {
		const aggregate = await this.getWorkspace(workspaceId);
		return aggregate ? this.snapshot(aggregate) : null;
	}

	async voidEvent(
		workspaceId: string,
		eventId: string,
		expectedHead: string,
		reason: string,
		actorId?: string,
	): Promise<WorkspaceAggregate> {
		const aggregate = await this.requireWorkspace(workspaceId);
		if (aggregate.eventHead !== expectedHead)
			throw new WorkspaceConflictError(
				`Workspace '${workspaceId}' head mismatch: expected ${expectedHead}, actual ${aggregate.eventHead ?? "none"}`,
			);
		const target = (
			await this.events.project(workspaceId, aggregate.sessionId, expectedHead)
		).find((record) => record.eventId === eventId);
		if (!target)
			throw new WorkspaceOperationError(
				`Workspace event '${eventId}' was not found`,
			);
		if (target.voided) return aggregate;
		const committed = await this.events.voidEvent(
			workspaceId,
			aggregate.sessionId,
			expectedHead,
			eventId,
			reason,
			actorId,
		);
		const projected = reduceWorkspaceEvents(
			await this.events.project(
				workspaceId,
				aggregate.sessionId,
				committed.commitId,
			),
		);
		projected.eventHead = committed.commitId;
		await this.store.save(projected);
		return projected;
	}

	resolveBranchRef(aggregate: WorkspaceAggregate, ref: string): Branch {
		const exactId = aggregate.branches.filter((branch) => branch.id === ref);
		if (exactId.length === 1) return exactId[0]!;
		const exactAlias = aggregate.branches.filter(
			(branch) => branch.commandAlias === ref,
		);
		if (exactAlias.length === 1) return exactAlias[0]!;
		const exactConcept = aggregate.branches.filter(
			(branch) => branch.hypothesisConcept.conceptId === ref,
		);
		if (exactConcept.length === 1) return exactConcept[0]!;
		const exactName = aggregate.branches.filter(
			(branch) => branch.name === ref,
		);
		if (exactName.length === 1) return exactName[0]!;
		const folded = ref.toLocaleLowerCase();
		const displayMatches = aggregate.branches.filter(
			(branch) =>
				branch.name.toLocaleLowerCase() === folded ||
				branch.hypothesisConcept.display?.toLocaleLowerCase() === folded,
		);
		if (displayMatches.length === 1) return displayMatches[0]!;
		if (
			displayMatches.length > 1 ||
			exactAlias.length > 1 ||
			exactConcept.length > 1 ||
			exactName.length > 1
		)
			throw new WorkspaceOperationError(
				`Branch reference '${ref}' is ambiguous`,
				"ambiguous_branch",
			);
		throw new WorkspaceOperationError(
			`Branch reference '${ref}' was not found`,
			"missing_branch",
		);
	}

	ingestFact(
		workspaceId: string,
		fact: TypedFact,
		expectedVersion: number,
		branchRef?: string,
		expectedHead?: string,
	): Promise<WorkspaceAggregate> {
		return this.applyOperations(
			workspaceId,
			[{ kind: "add_fact", workspaceId, fact, branchId: branchRef }],
			expectedVersion,
			expectedHead,
		);
	}

	async rebuildFromEvents(
		workspaceId: string,
	): Promise<WorkspaceAggregate | null> {
		const current = await this.requireWorkspace(workspaceId);
		if (!current.eventHead) return current;
		const records = await this.events.project(
			workspaceId,
			current.sessionId,
			current.eventHead,
		);
		if (!records.length) return null;
		const aggregate = reduceWorkspaceEvents(records);
		aggregate.eventHead = current.eventHead;
		await this.store.save(aggregate);
		return aggregate;
	}

	async prepareOperations(
		workspaceId: string,
		operations: WorkspaceOperation[],
		expectedVersion: number,
		expectedHead?: string,
	): Promise<PreparedWorkspaceMutation> {
		const aggregate = await this.requireWorkspace(workspaceId);
		if (aggregate.version !== expectedVersion)
			throw new WorkspaceConflictError(
				`Workspace '${workspaceId}' version mismatch: expected ${expectedVersion}, actual ${aggregate.version}`,
			);
		if (expectedHead && aggregate.eventHead !== expectedHead)
			throw new WorkspaceConflictError(
				`Workspace '${workspaceId}' head mismatch: expected ${expectedHead}, actual ${aggregate.eventHead ?? "none"}`,
			);
		const planned = this.planOperations(aggregate, operations);
		return { workspaceId, baseVersion: expectedVersion, ...planned };
	}

	async appendPrepared(
		prepared: PreparedWorkspaceMutation,
		transactionId?: string,
		idempotencyKey?: string,
	): Promise<{ commitId: string; records: WorkspaceEventRecord[] }> {
		return this.events.append(
			prepared.workspaceId,
			prepared.aggregate.sessionId,
			prepared.aggregate.eventHead ?? "",
			prepared.events,
			transactionId,
			idempotencyKey,
		);
	}

	async finalizePrepared(
		prepared: PreparedWorkspaceMutation,
		commitId: string,
	): Promise<void> {
		const records = await this.events.project(
			prepared.workspaceId,
			prepared.aggregate.sessionId,
			commitId,
		);
		const projected = reduceWorkspaceEvents(records);
		projected.eventHead = commitId;
		await this.store.save(projected);
	}

	private planOperations(
		initial: WorkspaceAggregate,
		operations: readonly WorkspaceOperation[],
	): { aggregate: WorkspaceAggregate; events: WorkspaceEvent[] } {
		let aggregate = structuredClone(initial) as WorkspaceAggregate;
		const events: WorkspaceEvent[] = [];
		for (const operation of operations) {
			if (operation.workspaceId !== aggregate.id)
				throw new WorkspaceOperationError(
					"Operation workspace does not match aggregate",
				);
			if (
				operation.kind === "add_fact" &&
				this.hasFact(aggregate, operation.fact.factId, operation.branchId)
			)
				continue;
			if (operation.kind === "close" && aggregate.closeRequested) continue;
			const event = this.toEvent(aggregate, operation);
			events.push(event);
			aggregate = reduceWorkspaceEvent(aggregate, event);
			aggregate.version = initial.version + events.length;
			if (
				operation.kind === "create_branch" &&
				event.kind === "branch_created"
			) {
				const findings = [
					...(operation.supportingFindings ?? []).map((finding) => ({
						...finding,
						certainty: "supporting" as const,
					})),
					...(operation.refutingFindings ?? []).map((finding) => ({
						...finding,
						certainty: "refuting" as const,
					})),
				];
				for (const finding of findings) {
					const factOperation: WorkspaceOperation = {
						kind: "add_fact",
						workspaceId: aggregate.id,
						branchId: event.branchId,
						fact: {
							factId: finding.concept.conceptId ?? finding.concept.display,
							targetSchema: "ObservationEvent",
							concept: finding.concept,
							certainty: finding.certainty,
							provenance: {},
						},
					};
					if (
						this.hasFact(
							aggregate,
							factOperation.fact.factId,
							factOperation.branchId,
						)
					)
						continue;
					const factEvent = this.toEvent(aggregate, factOperation);
					events.push(factEvent);
					aggregate = reduceWorkspaceEvent(aggregate, factEvent);
					aggregate.version = initial.version + events.length;
				}
			}
		}
		return { aggregate, events };
	}

	private toEvent(
		aggregate: WorkspaceAggregate,
		operation: WorkspaceOperation,
	): WorkspaceEvent {
		if (aggregate.completed)
			throw new WorkspaceOperationError("Completed workspace is immutable");
		if (aggregate.closeRequested && operation.kind !== "complete")
			throw new WorkspaceOperationError(
				"Closed workspace does not accept new operations",
			);

		switch (operation.kind) {
			case "create_branch": {
				if (
					operation.commandAlias &&
					aggregate.branches.some(
						(branch) => branch.commandAlias === operation.commandAlias,
					)
				)
					throw new WorkspaceOperationError(
						`Branch alias '${operation.commandAlias}' is already in use`,
						"ambiguous_branch",
					);
				const parent = operation.parentBranchId
					? this.resolveBranchRef(aggregate, operation.parentBranchId)
					: undefined;
				const branchId = `branch_${crypto.randomUUID()}`;
				return {
					kind: "branch_created",
					workspaceId: aggregate.id,
					branchId,
					name: operation.name,
					parentBranchId: parent?.id ?? aggregate.activeBranchId,
					hypothesisConcept: operation.concept,
					status: operation.initialStatus,
					commandAlias: operation.commandAlias,
					metadata: { logicalKey: `branch:${branchId}` },
				};
			}
			case "add_fact": {
				const branch = operation.branchId
					? this.resolveBranchRef(aggregate, operation.branchId)
					: undefined;
				this.validateFact(aggregate, operation.fact, branch?.id);
				if (branch) {
					return {
						kind: "concept_added",
						workspaceId: aggregate.id,
						branchId: branch.id,
						fact: {
							...operation.fact,
							workspaceId: aggregate.id,
							branchId: branch.id,
						},
						conceptType:
							operation.fact.certainty === "refuting"
								? "refuting"
								: "supporting",
						metadata: { logicalKey: `fact:${operation.fact.factId}` },
					};
				}
				return {
					kind: "global_fact_added",
					workspaceId: aggregate.id,
					fact: { ...operation.fact, workspaceId: aggregate.id },
					metadata: { logicalKey: `fact:${operation.fact.factId}` },
				};
			}
			case "remove_fact":
				if (operation.branchId) {
					this.validateFact(
						aggregate,
						{ factId: operation.factId } as TypedFact,
						operation.branchId,
					);
					return {
						kind: "concept_removed",
						workspaceId: aggregate.id,
						branchId: operation.branchId,
						factId: operation.factId,
						reason: operation.reason,
						metadata: {
							logicalKey: `fact:${operation.branchId}:${operation.factId}`,
							reason: operation.reason,
						},
					};
				}
				return {
					kind: "global_fact_removed",
					workspaceId: aggregate.id,
					factId: operation.factId,
					reason: operation.reason,
					metadata: {
						logicalKey: `fact:${operation.factId}`,
						reason: operation.reason,
					},
				};
			case "branch_transition": {
				const branch = this.resolveBranchRef(aggregate, operation.branchId);
				this.validateTransition(aggregate, branch.id, operation.transition);
				return {
					kind: "branch_lifecycle_transitioned",
					workspaceId: aggregate.id,
					branchId: branch.id,
					fromStatus: branch.status,
					toStatus:
						operation.transition === "rule_out"
							? "ruled_out"
							: operation.transition === "confirm"
								? "confirmed"
								: operation.transition === "suspend"
									? "suspended"
									: "active",
					reason: operation.reason,
					actorId: operation.actorId,
					sourceCellId: operation.sourceCellId,
					metadata: {
						logicalKey: `branch:${operation.branchId}`,
						actorId: operation.actorId,
						reason: operation.reason,
						sourceCellId: operation.sourceCellId,
					},
				};
			}
			case "close":
				return {
					kind: "workspace_close_requested",
					workspaceId: aggregate.id,
					metadata: { logicalKey: "workspace:lifecycle" },
				};
			case "complete": {
				const branch = this.resolveBranchRef(
					aggregate,
					operation.winningBranchId,
				);
				return {
					kind: "workspace_completed",
					workspaceId: aggregate.id,
					winningBranchId: branch.id,
					winningBranchName: branch.name,
					metadata: { logicalKey: "workspace:completion" },
				};
			}
		}
	}

	private async requireWorkspace(
		workspaceId: string,
	): Promise<WorkspaceAggregate> {
		const aggregate = await this.store.get(workspaceId);
		if (!aggregate)
			throw new WorkspaceOperationError(
				`Workspace '${workspaceId}' was not found`,
			);
		return aggregate;
	}

	private branch(
		aggregate: WorkspaceAggregate,
		branchId: string,
	): Branch | undefined {
		return aggregate.branches.find((branch) => branch.id === branchId);
	}

	private validateFact(
		aggregate: WorkspaceAggregate,
		fact: TypedFact,
		branchId?: string,
	): void {
		if (branchId && !this.branch(aggregate, branchId))
			throw new WorkspaceOperationError("Branch was not found");
	}

	private hasFact(
		aggregate: WorkspaceAggregate,
		factId: string,
		branchId?: string,
	): boolean {
		if (branchId) {
			const branch = this.branch(aggregate, branchId);
			const key = factId.trim().toLowerCase();
			const matches = (concept: TypedFact["concept"]): boolean =>
				(concept?.conceptId ?? concept?.display ?? "").trim().toLowerCase() ===
				key;
			return Boolean(
				branch?.supportingConcepts.some(matches) ||
					branch?.refutingConcepts.some(matches),
			);
		}
		return aggregate.globalFacts.some((fact) => fact.factId === factId);
	}

	private validateTransition(
		aggregate: WorkspaceAggregate,
		branchId: string,
		transition: "confirm" | "rule_out" | "suspend" | "reactivate",
	): void {
		const branch = this.branch(aggregate, branchId);
		if (!branch) throw new WorkspaceOperationError("Branch was not found");
		const allowed: Record<string, string[]> = {
			active: ["confirm", "rule_out", "suspend"],
			suspended: ["reactivate", "confirm", "rule_out"],
			ruled_out: ["reactivate"],
			confirmed: [],
			closed: [],
		};
		if (!allowed[branch.status]?.includes(transition))
			throw new WorkspaceOperationError(
				`Transition '${transition}' is invalid from '${branch.status}'`,
			);
	}

	private snapshot(aggregate: WorkspaceAggregate): WorkspaceSnapshot {
		return {
			workspaceId: aggregate.id,
			sessionId: aggregate.sessionId,
			sourceDocumentId: aggregate.sourceDocumentId,
			activeBranchId: aggregate.activeBranchId,
			branches: aggregate.branches.map((branch) => ({
				branchId: branch.id,
				name: branch.name,
				status: branch.status,
				hypothesisConcept: branch.hypothesisConcept,
				supportingConcepts: branch.supportingConcepts,
				refutingConcepts: branch.refutingConcepts,
				commandAlias: branch.commandAlias,
			})),
			globalFacts: aggregate.globalFacts,
			closeRequested: aggregate.closeRequested,
			completed: aggregate.completed ?? false,
			version: aggregate.version,
			eventHead: aggregate.eventHead,
		};
	}
}

export function workspaceOperationsFromPlan(
	plan: MacroExecutionPlan,
): WorkspaceOperation[] {
	return plan.workspaceOperations ?? [];
}
