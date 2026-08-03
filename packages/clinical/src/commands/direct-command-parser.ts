import type { WorkspaceOperation } from "../workspaces/workspace-types";
import type {
	CommandBarInput,
	CommandBarIntent,
	CommandBarWorkspaceContext,
	CommandDiagnostic,
} from "./command-bar-types";
import {
	_DIRECT_COMMANDS,
	type CommandSyntaxProfile,
	createCommandSyntaxProfile,
} from "./command-syntax-profile";

export async function parseDirectCommand(
	input: CommandBarInput,
	context: CommandBarWorkspaceContext,
	profile: CommandSyntaxProfile = createCommandSyntaxProfile({
		profileId: "v2-default",
	}),
): Promise<CommandBarIntent> {
	const diagnostics: CommandDiagnostic[] = [];
	const text = input.rawText.trim();
	if (!text) return invalidIntent(input, "empty_command", "Command is empty");
	if (!text.startsWith(profile.directCommandToken))
		return invalidIntent(
			input,
			"invalid_argument",
			`Direct commands must start with '${profile.directCommandToken}'`,
		);

	const tokens = tokenize(text.slice(profile.directCommandToken.length).trim());
	const alias = tokens.shift()?.toLocaleLowerCase();
	const verb = alias ? profile.directCommandMappings[alias] : undefined;
	if (!verb || !_DIRECT_COMMANDS.includes(verb))
		return invalidIntent(
			input,
			"unknown_command",
			`Unknown direct command '${verb ?? ""}'`,
		);
	if (!input.workspaceId)
		return invalidIntent(
			input,
			"missing_context",
			"A workspace is required for this command",
		);

	const workspace = await context.getWorkspace(input.workspaceId);
	if (!workspace)
		return invalidIntent(
			input,
			"missing_context",
			`Workspace '${input.workspaceId}' was not found`,
		);

	try {
		const operation = await operationFor(
			verb,
			tokens,
			input,
			workspace,
			context,
		);
		return {
			kind: "workspace_operation",
			rawText: input.rawText,
			sessionId: input.sessionId,
			workspaceId: input.workspaceId,
			documentId: input.documentId,
			cellId: input.cellId,
			operation,
			diagnostics,
		};
	} catch (error) {
		const diagnosticCode =
			error && typeof error === "object" && "diagnosticCode" in error
				? String(error.diagnosticCode)
				: "invalid_argument";
		return invalidIntent(
			input,
			diagnosticCode === "ambiguous_branch"
				? "ambiguous_reference"
				: diagnosticCode === "missing_branch"
					? "missing_context"
					: "invalid_argument",
			error instanceof Error ? error.message : String(error),
		);
	}
}

async function operationFor(
	verb: string,
	tokens: string[],
	input: CommandBarInput,
	workspace: NonNullable<
		Awaited<ReturnType<CommandBarWorkspaceContext["getWorkspace"]>>
	>,
	context: CommandBarWorkspaceContext,
): Promise<WorkspaceOperation> {
	if (verb === "close") {
		if (tokens.length) throw new Error(":close does not accept arguments");
		return { kind: "close", workspaceId: input.workspaceId! };
	}
	if (verb === "branch") {
		const name = tokens.shift();
		const concept = valueOption(tokens, "concept");
		if (!name) throw new Error("Missing branch name");
		if (!concept) throw new Error("Missing branch concept=<conceptId>");
		const parentRef = valueOption(tokens, "parent");
		return {
			kind: "create_branch",
			workspaceId: input.workspaceId!,
			name,
			concept: { conceptId: concept, display: concept },
			parentBranchId: parentRef
				? context.resolveBranchRef(workspace, parentRef).id
				: undefined,
		};
	}

	const branchRef = tokens.shift();
	if (!branchRef) throw new Error(`Missing branch reference for :${verb}`);
	const branchId = context.resolveBranchRef(workspace, branchRef).id;
	const reason = valueOption(tokens, "reason");
	if (tokens.length) throw new Error(`Unexpected argument '${tokens[0]}'`);
	if (verb === "complete")
		return {
			kind: "complete",
			workspaceId: input.workspaceId!,
			winningBranchId: branchId,
		};
	if (
		verb === "confirm" ||
		verb === "rule_out" ||
		verb === "suspend" ||
		verb === "re_activate"
	)
		return {
			kind: "branch_transition",
			workspaceId: input.workspaceId!,
			branchId,
			transition: verb === "re_activate" ? "reactivate" : verb,
			reason,
			actorId: input.actorId,
			sourceCellId: input.cellId,
		};
	throw new Error(`Unsupported command ':${verb}'`);
}

function valueOption(tokens: string[], key: string): string | undefined {
	const index = tokens.findIndex((token) => token.startsWith(`${key}=`));
	if (index < 0) return undefined;
	const [, ...value] = tokens.splice(index, 1)[0]!.split("=");
	return value.join("=") || undefined;
}

function tokenize(text: string): string[] {
	const tokens: string[] = [];
	const pattern = /(?:[^\s"]+|"[^"]*")+/g;
	for (const match of text.matchAll(pattern))
		tokens.push(match[0]!.replace(/^"|"$/g, ""));
	return tokens;
}

function invalidIntent(
	input: CommandBarInput,
	code: CommandDiagnostic["code"],
	message: string,
): CommandBarIntent {
	return {
		kind: "unsupported",
		rawText: input.rawText,
		sessionId: input.sessionId,
		workspaceId: input.workspaceId,
		documentId: input.documentId,
		cellId: input.cellId,
		diagnostics: [{ code, message, severity: "error" }],
	};
}
