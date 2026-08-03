import type { ClinicalEngineV2, ExecutionResult } from "../engine/clinical-engine-v2";
import type { WorkspaceService } from "../workspaces/workspace-service";
import type { MacroExecutionPlan } from "../macros/macro-plan";
import { parseDirectCommand } from "./direct-command-parser";
import type {
	CommandBarInput,
	CommandBarIntent,
	CommandBarWorkspaceContext,
	CommandExecutionInput,
	CommandPreview,
} from "./command-bar-types";
import { createV2CommandSyntaxProfile, type V2CommandSyntaxProfile } from "./command-syntax-profile";
import { parseV2VariableCommand } from "./variable-command";
import type { V2VariableCommandService } from "./variable-command-service";
import type { V2VariableCellService } from "../cells/variable-cell-service";

export class V2CommandBarService {
	constructor(
	private readonly engine: ClinicalEngineV2,
		private readonly workspaceService: WorkspaceService,
		private readonly syntaxProfile: V2CommandSyntaxProfile = createV2CommandSyntaxProfile({ profileId: "v2-default" }),
		private readonly variableService?: V2VariableCommandService,
		private readonly variableCellService?: V2VariableCellService,
	) {}

	async preview(input: CommandBarInput): Promise<CommandPreview> {
		const intent = await parseDirectCommand(input, this.workspaceContext(), this.syntaxProfile);
		if (input.rawText.trim().startsWith(`${this.syntaxProfile.variableCommandToken}${this.syntaxProfile.variableCommandName}`)) {
			try {
				const variableIntent: CommandBarIntent = {
					kind: "variable_operation",
					rawText: input.rawText,
					sessionId: input.sessionId,
					variableStatement: parseV2VariableCommand(input.rawText, this.syntaxProfile),
					diagnostics: [],
				};
				const fingerprint = fingerprintFor(variableIntent);
				return { intent: variableIntent, fingerprint, diagnostics: [] };
			} catch (error) {
				const variableIntent: CommandBarIntent = {
					kind: "unsupported",
					rawText: input.rawText,
					sessionId: input.sessionId,
					diagnostics: [{ code: "invalid_argument", message: error instanceof Error ? error.message : String(error), severity: "error" }],
				};
				const fingerprint = fingerprintFor(variableIntent);
				return { intent: variableIntent, fingerprint, diagnostics: variableIntent.diagnostics };
			}
		}
		const plan = intent.operation && input.workspaceId
			? await this.planForIntent(intent, input)
			: undefined;
		const fingerprint = fingerprintFor(intent, plan);
		const fingerprintedPlan = plan
			? { ...plan, fingerprint: { value: fingerprint, algorithm: "v2-plan-fingerprint-v1" as const } }
			: undefined;
		return { intent, plan: fingerprintedPlan, fingerprint, diagnostics: intent.diagnostics };
	}

	async execute(input: CommandExecutionInput): Promise<ExecutionResult> {
		const preview = await this.preview(input);
		if (preview.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
			return { status: "failed", transactionId: "", planFingerprint: preview.fingerprint, error: preview.diagnostics.map((diagnostic) => diagnostic.message).join("; ") };
		}
		if (!preview.plan) {
			if (preview.intent.kind === "variable_operation" && preview.intent.variableStatement) {
				if (this.variableCellService) {
					await this.variableCellService.execute(
						input.sessionId,
						{ kind: "notebook", collectionId: input.sessionId },
						input.rawText,
					);
					return { status: "committed", transactionId: `variable:${input.sessionId}`, planFingerprint: preview.fingerprint };
				}
				if (!this.variableService) return { status: "failed", transactionId: "", planFingerprint: preview.fingerprint, error: "V2 variable service is not configured" };
				await this.variableService.execute(input.sessionId, preview.intent.variableStatement);
				return { status: "committed", transactionId: `variable:${input.sessionId}`, planFingerprint: preview.fingerprint };
			}
			return { status: "failed", transactionId: "", planFingerprint: preview.fingerprint, error: "Command did not produce an executable plan" };
		}
		if (input.expectedFingerprint && input.expectedFingerprint !== preview.fingerprint)
			return { status: "failed", transactionId: "", planFingerprint: preview.fingerprint, error: "Command preview fingerprint is stale" };
		return this.engine.executePlan(preview.plan);
	}

	private workspaceContext(): CommandBarWorkspaceContext {
		return {
			getWorkspace: (workspaceId) => this.workspaceService.getWorkspace(workspaceId),
			resolveBranchRef: (workspace, ref) => this.workspaceService.resolveBranchRef(workspace, ref),
		};
	}

	private async planForIntent(intent: CommandBarIntent, input: CommandBarInput): Promise<MacroExecutionPlan> {
		const workspace = await this.workspaceService.getWorkspace(input.workspaceId!);
		if (!workspace) throw new Error(`Workspace '${input.workspaceId}' was not found`);
		const document = input.documentId ? await this.engine.getDocument(input.documentId) : undefined;
		const scope = input.documentId
			? { kind: "composite" as const, sessionId: input.sessionId, workspaceId: workspace.id, documentId: input.documentId }
			: { kind: "workspace" as const, sessionId: input.sessionId, workspaceId: workspace.id };
		return {
			groupId: `command:${input.sessionId}:${workspace.id}`,
			scope,
			macroDefinitions: [],
			operations: [],
			links: [],
			generatedCells: [],
			workspaceOperations: [intent.operation as NonNullable<MacroExecutionPlan["workspaceOperations"]>[number]],
			expectedVersions: [
				{ aggregateKind: "workspace", aggregateId: workspace.id, expectedVersion: workspace.version, expectedHead: workspace.eventHead },
				...(document ? [{ aggregateKind: "document" as const, aggregateId: document.documentId, expectedVersion: document.version, expectedHead: document.eventHead }] : []),
			],
			fingerprint: { value: "", algorithm: "v2-plan-fingerprint-v1" },
			diagnostics: [],
		};
	}
}

function fingerprintFor(intent: CommandBarIntent, plan?: MacroExecutionPlan): string {
	const source = JSON.stringify({ rawText: intent.rawText, operation: intent.operation, expectedVersions: plan?.expectedVersions });
	let hash = 2166136261;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
}
