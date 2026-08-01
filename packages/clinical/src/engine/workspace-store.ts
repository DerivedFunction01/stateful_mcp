import type { EventStore, ObjectStore } from "@stateful-mcp/core";
import type { CdslParser } from "../parser/cdsl-parser";
import type { SoapNote } from "../schemas/document";
import type {
	BranchLifecycleState,
	ClinicalBranch,
	EpistemicWorkspace,
} from "../schemas/epistemic";
import { buildPatientLearningBucket } from "../schemas/patient";
import type { CodeableConcept } from "../schemas/shared";

export type WorkspaceCommandVerb =
	| "branch"
	| "rule_out"
	| "confirm"
	| "suspend"
	| "re_activate"
	| "elevate"
	| "close";

export type WorkspaceCommand =
	| { verb: "branch"; branchName: string; conceptRef: string; fresh?: boolean }
	| {
			verb: "rule_out" | "confirm" | "suspend" | "re_activate";
			branchRef: string;
	  }
	| { verb: "elevate"; branchRef: string; delta: number }
	| { verb: "close" };

export type WorkspaceCommandWarning =
	| "MALFORMED"
	| "UNKNOWN_ALIAS"
	| "MISSING_BRANCH"
	| "BRANCH_NOT_FOUND"
	| "AMBIGUOUS_BRANCH"
	| "UNSUPPORTED_TRANSITION"
	| "NO_WORKSPACE_CONTEXT"
	| "UNRESOLVED_CONCEPT"
	| "DUPLICATE_COMMAND_ALIAS";

export class WorkspaceStore {
	constructor(
		private objectStore: ObjectStore,
		private eventStore: EventStore,
		private parser?: CdslParser,
		private personnelId: string = "system",
	) {}

	setParser(parser: CdslParser): void {
		this.parser = parser;
	}

	async init(
		sessionId: string,
		soapNoteId: string,
		candidateConcepts: CodeableConcept[],
		alias?: string,
	): Promise<string> {
		const effectiveAlias = alias ?? sessionId;

		const activeObj = await this.objectStore.getObject(
			effectiveAlias,
			sessionId,
		);
		if (!activeObj) {
			throw new Error("No active SOAP Note found for session");
		}

		const linkedSourceEventId = sessionId;
		const workspaceId = `work_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

		const branches: ClinicalBranch[] = candidateConcepts.length
			? candidateConcepts.map((concept, idx) => ({
					id: `branch_${workspaceId}_${idx}`,
					parentId: null,
					name: concept.display || "Hypothesis Branch",
					commandAlias: undefined,
					hypothesisConcept: concept,
					status: (idx === 0 ? "active" : "suspended") as BranchLifecycleState,
					supportingConcepts: [],
					refutingConcepts: [],
					createdAt: {
						assertedTimestampUtc: new Date().toISOString(),
						precisionLevel: "second",
					},
				}))
			: [
					{
						id: `branch_${workspaceId}_default`,
						parentId: null,
						name: "Hypothesis",
						commandAlias: undefined,
						hypothesisConcept: {
							conceptId: "hypothesis_default",
							display: "Hypothesis",
						},
						status: "active" as BranchLifecycleState,
						supportingConcepts: [],
						refutingConcepts: [],
						createdAt: {
							assertedTimestampUtc: new Date().toISOString(),
							precisionLevel: "second" as const,
						},
					},
				];

		const workspace: EpistemicWorkspace = {
			id: workspaceId,
			sourceSoapNoteId: soapNoteId,
			linkedSourceEventId,
			branches,
			activeBranchId: branches[0]?.id || "",
			globalFacts: [],
		};

		const storeAny = this.objectStore as any;
		if (!storeAny.schemas?.has("EpistemicWorkspace")) {
			try {
				this.objectStore.registerSchema("EpistemicWorkspace", {
					type: "object",
					properties: {
						id: { type: "string" },
						sourceSoapNoteId: { type: "string" },
						linkedSourceEventId: { type: "string" },
						branches: { type: "array" },
						activeBranchId: { type: "string" },
						globalFacts: { type: "array" },
						closeRequested: { type: "boolean" },
					},
					required: ["id", "sourceSoapNoteId", "linkedSourceEventId"],
				});
			} catch (_) {
				// schema may already be registered
			}
		}

		await this.objectStore.init(
			"EpistemicWorkspace",
			sessionId,
			workspaceId,
			workspace,
		);

		if (!this.eventStore.schemas?.has("workspace_events")) {
			this.eventStore.schemas.set("workspace_events", { type: "object" });
		}
		await this.eventStore.init("workspace_events", sessionId, workspaceId, []);

		await this.eventStore.append(
			sessionId,
			workspaceId,
			{
				targetSchema: "workspace_initialized",
				workspaceId,
				sourceSoapNoteId: soapNoteId,
				branches: branches.map((b) => b.id),
				activeBranchId: branches[0]?.id || "",
				globalFacts: [],
			},
			workspaceId,
		);

		return workspaceId;
	}

	async process(
		sessionId: string,
		workspaceId: string,
		branchId: string,
		dictation: string,
		workspaceCommands?: WorkspaceCommand[] | string,
		alias?: string,
	): Promise<EpistemicWorkspace> {
		// Preserve the historical fifth-argument alias call shape for external callers.
		if (typeof workspaceCommands === "string") {
			alias = workspaceCommands;
			workspaceCommands = undefined;
		}
		if (!this.parser) {
			throw new Error(
				"CdslParser is required for WorkspaceStore.process. Pass it to the constructor.",
			);
		}

		const effectiveAlias = alias ?? sessionId;

		const workspace = await this.get(sessionId, workspaceId);
		if (!workspace) {
			throw new Error(`Epistemic workspace ${workspaceId} not found`);
		}

		const targetBranch = workspace.branches.find((b) => b.id === branchId);
		if (!targetBranch) {
			throw new Error(`Branch ${branchId} not found in workspace`);
		}

		if (workspace.activeBranchId !== branchId) {
			const previousBranchId = workspace.activeBranchId;
			workspace.activeBranchId = branchId;

			await this.eventStore.append(
				sessionId,
				workspaceId,
				{
					targetSchema: "branch_switched",
					fromBranchId: previousBranchId,
					toBranchId: branchId,
				},
				workspaceId,
			);
		}

		const parentNoteObj = await this.objectStore.getObject(
			effectiveAlias,
			sessionId,
		);
		if (parentNoteObj) {
			const note = parentNoteObj.data as SoapNote;
			const newGlobalFacts = [
				...((note.objective?.vitalSigns || []) as unknown as Array<
					Record<string, unknown>
				>),
				...((note.objective?.clinicalObservations || []) as unknown as Array<
					Record<string, unknown>
				>),
			];

			if (
				JSON.stringify(newGlobalFacts) !== JSON.stringify(workspace.globalFacts)
			) {
				workspace.globalFacts = newGlobalFacts;
				await this.eventStore.append(
					sessionId,
					workspaceId,
					{
						targetSchema: "global_facts_updated",
						globalFacts: newGlobalFacts,
					},
					workspaceId,
				);
			}
		}

		const noteObj = parentNoteObj
			? (parentNoteObj.data as SoapNote)
			: undefined;
		const patientBucket = noteObj
			? buildPatientLearningBucket(noteObj.patient)
			: undefined;
		const items = await this.parser.parse(dictation, {
			personnelId: this.personnelId,
			patientContext: patientBucket,
		});

		const activeBranch = workspace.branches.find(
			(b) => b.id === workspace.activeBranchId,
		);
		if (activeBranch && items.length > 0) {
			const addedConcepts: { concept: CodeableConcept[]; type: string }[] = [];

			for (const item of items) {
				const schemaClean = item.targetSchema.toLowerCase();
				if (
					schemaClean === "vitalsmeasurementevent" ||
					(schemaClean === "observationevent" &&
						item.extractedData?.certainty !== "refuted")
				) {
					workspace.globalFacts.push(
						item as unknown as Record<string, unknown>,
					);
					await this.eventStore.append(
						sessionId,
						workspaceId,
						{
							targetSchema: "global_facts_updated",
							globalFacts: workspace.globalFacts,
						},
						workspaceId,
					);
				} else {
					if (item.extractedData?.certainty === "refuted") {
						activeBranch.refutingConcepts.push(...(item.concept || []));
						addedConcepts.push({
							concept: item.concept || [],
							type: "refuting",
						});
					} else {
						activeBranch.supportingConcepts.push(...(item.concept || []));
						addedConcepts.push({
							concept: item.concept || [],
							type: "supporting",
						});
					}
				}
			}

			for (const addition of addedConcepts) {
				await this.eventStore.append(
					sessionId,
					workspaceId,
					{
						targetSchema: "concept_added",
						branchId: activeBranch.id,
						concepts: addition.concept,
						conceptType: addition.type,
					},
					workspaceId,
				);
			}
		}

		await this.objectStore.set(
			workspaceId,
			[],
			workspace as unknown as Record<string, any>,
			sessionId,
		);
		if (workspaceCommands?.length)
			await this.executeCommands(
				sessionId,
				workspaceId,
				workspace,
				workspaceCommands,
			);

		return workspace;
	}

	private async executeCommands(
		sessionId: string,
		workspaceId: string,
		workspace: EpistemicWorkspace,
		commands: WorkspaceCommand[],
	): Promise<void> {
		for (const command of commands) {
			if (command.verb === "close") {
				workspace.closeRequested = true;
				await this.eventStore.append(
					sessionId,
					workspaceId,
					{ targetSchema: "workspace_close_requested" },
					workspaceId,
				);
				continue;
			}
			if (command.verb === "branch") {
				let concept = workspace.branches.find(
					(b) => b.hypothesisConcept.conceptId === command.conceptRef,
				)?.hypothesisConcept;
				if (!concept && command.fresh) {
					concept = {
						conceptId: `fresh_${command.branchName.toLowerCase().replace(/\s+/g, "_")}`,
						display: command.conceptRef,
					};
				}
				if (!concept) continue;
				const branch: ClinicalBranch = {
					id: `branch_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
					parentId: workspace.activeBranchId || null,
					name: command.branchName,
					hypothesisConcept: concept,
					status: "active",
					supportingConcepts: [],
					refutingConcepts: [],
					createdAt: {
						assertedTimestampUtc: new Date().toISOString(),
						precisionLevel: "second",
					},
				};
				workspace.branches.push(branch);
				await this.eventStore.append(
					sessionId,
					workspaceId,
					{
						targetSchema: "branch_created",
						branchId: branch.id,
						name: branch.name,
					},
					workspaceId,
				);
				continue;
			}
			const matches = workspace.branches.filter((b) =>
				[
					b.id,
					b.commandAlias,
					b.name,
					b.hypothesisConcept.conceptId,
					b.hypothesisConcept.display,
				]
					.filter(Boolean)
					.some(
						(v) =>
							v === command.branchRef ||
							v?.toLowerCase() === command.branchRef.toLowerCase(),
					),
			);
			if (matches.length !== 1) continue;
			const branch = matches[0]!;
			if (command.verb === "elevate") continue;
			const status: BranchLifecycleState =
				command.verb === "rule_out"
					? "ruled_out"
					: command.verb === "confirm"
						? "confirmed"
						: command.verb === "suspend"
							? "suspended"
							: "active";
			branch.status = status;
			await this.eventStore.append(
				sessionId,
				workspaceId,
				{
					targetSchema: `branch_${command.verb === "rule_out" ? "ruled_out" : command.verb === "re_activate" ? "re_activated" : command.verb}`,
					branchId: branch.id,
				},
				workspaceId,
			);
		}
		await this.objectStore.set(
			workspaceId,
			[],
			workspace as unknown as Record<string, any>,
			sessionId,
		);
	}

	async complete(
		sessionId: string,
		workspaceId: string,
		winningBranchId: string,
		alias?: string,
	): Promise<string> {
		const effectiveAlias = alias ?? sessionId;

		const workspace = await this.get(sessionId, workspaceId);
		if (!workspace) {
			throw new Error(`Epistemic workspace ${workspaceId} not found`);
		}

		const winningBranch = workspace.branches.find(
			(b) => b.id === winningBranchId,
		);
		if (!winningBranch) {
			throw new Error(
				`Winning branch ${winningBranchId} not found in workspace`,
			);
		}

		await this.eventStore.append(
			sessionId,
			workspaceId,
			{
				targetSchema: "workspace_completed",
				workspaceId,
				winningBranchId,
				winningBranchName: winningBranch.name,
			},
			workspaceId,
		);

		let currentCommitId = effectiveAlias;

		currentCommitId = await this.eventStore.append(
			sessionId,
			currentCommitId,
			{
				targetSchema: "PrimaryDiagnosisEntry",
				tag: "PrimaryDiagnosisEntry",
				concept: [winningBranch.hypothesisConcept],
				rawText: `Confirmed via workspace branching: ${winningBranch.name}`,
				extractedData: {
					acuityLevel: "acute",
					supportingConcepts: winningBranch.supportingConcepts,
				},
			},
			effectiveAlias,
		);

		for (const branch of workspace.branches) {
			if (branch.id !== winningBranchId) {
				currentCommitId = await this.eventStore.append(
					sessionId,
					currentCommitId,
					{
						targetSchema: "DifferentialDiagnosisEntry",
						tag: "DifferentialDiagnosisEntry",
						concept: [branch.hypothesisConcept],
						rawText: `Ruled out via workspace branching: ${branch.name}`,
						extractedData: {
							rank: 2,
							confidence: "refuted",
							supportingConcepts: branch.supportingConcepts,
							refutingConcepts: branch.refutingConcepts,
							status: "ruled_out",
						},
					},
					effectiveAlias,
				);
			}
		}

		return currentCommitId;
	}

	async focus(
		sessionId: string,
		workspaceId: string,
		branchRef: string,
	): Promise<void> {
		const workspace = await this.get(sessionId, workspaceId);
		if (!workspace)
			throw new Error(`Epistemic workspace ${workspaceId} not found`);
		const branch = workspace.branches.find((candidate) =>
			[
				candidate.id,
				candidate.commandAlias,
				candidate.name,
				candidate.hypothesisConcept.conceptId,
				candidate.hypothesisConcept.display,
			]
				.filter(Boolean)
				.some(
					(value) =>
						value === branchRef ||
						value?.toLowerCase() === branchRef.toLowerCase(),
				),
		);
		if (!branch) throw new Error(`Branch ${branchRef} not found`);
		if (workspace.activeBranchId === branch.id) return;
		const previousBranchId = workspace.activeBranchId;
		workspace.activeBranchId = branch.id;
		await this.eventStore.append(
			sessionId,
			workspaceId,
			{
				targetSchema: "branch_switched",
				fromBranchId: previousBranchId,
				toBranchId: branch.id,
			},
			workspaceId,
		);
		await this.objectStore.set(
			workspaceId,
			[],
			workspace as unknown as Record<string, any>,
			sessionId,
		);
	}

	async get(
		sessionId: string,
		workspaceId: string,
	): Promise<EpistemicWorkspace | null> {
		const obj = await this.objectStore.getObject(workspaceId, sessionId);
		if (!obj) return null;
		return obj.data as EpistemicWorkspace;
	}

	async list(
		sessionId: string,
		soapNoteId: string,
	): Promise<EpistemicWorkspace[]> {
		const session = (this.objectStore as any).session as {
			listSession: (sessionId: string) => Promise<string[]>;
		};
		const allIds = await session.listSession(sessionId);
		const results: EpistemicWorkspace[] = [];

		for (const id of allIds) {
			const obj = await this.objectStore.getObject(id, sessionId);
			if (
				obj &&
				obj.schemaName === "EpistemicWorkspace" &&
				(obj.data as any)?.sourceSoapNoteId === soapNoteId
			) {
				results.push(obj.data as EpistemicWorkspace);
			}
		}

		return results;
	}
}
