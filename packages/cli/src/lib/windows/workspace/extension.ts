import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { VariableCommandProvider } from "@stateful-mcp/clinical/session/variable-command-provider";
import { WorkspaceCommandProvider } from "@stateful-mcp/clinical/session/workspace-command-provider";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import type { ParserSyntaxProfile } from "@stateful-mcp/clinical/store/interfaces";
import type {
	EditorExtension,
	WindowEffect,
	WindowIntent,
	WindowScope,
} from "../../runtime/extension";
import { descriptorsToContributions } from "../notebook/extension";

export interface WorkspaceProfileDeps {
	profile: ParserSyntaxProfile;
	snapshot: WorkspaceSnapshot | null;
	/** Shared editor (core/command-input) descriptor contributions. */
	editorDescriptors: CommandDescriptor[];
	onCommand(intent: WindowIntent, scope: WindowScope): Promise<WindowEffect[]>;
}

/**
 * The workspace window profile: contributes shared editor descriptors plus
 * workspace + variable command descriptors as extension contributions, scoped
 * to the workspace window. Command execution is delegated to the host's
 * `onCommand` handler, which maps the workspace command result onto the shared
 * `commandResultToEffects` router.
 */
export function buildWorkspaceExtension(
	deps: WorkspaceProfileDeps,
): EditorExtension {
	const workspaceProvider = new WorkspaceCommandProvider(deps.profile);
	const variableProvider = new VariableCommandProvider();
	const workspaceDescriptors = workspaceProvider.getDescriptors();
	const variableDescriptors = variableProvider.getDescriptors();

	const editorContribs = descriptorsToContributions(
		deps.editorDescriptors,
		"editor",
		"workspace.",
	);
	const workspaceContribs = descriptorsToContributions(
		workspaceDescriptors,
		"window",
		"workspace.",
	);
	const variableContribs = descriptorsToContributions(
		variableDescriptors,
		"window",
		"workspace.",
	);

	const allContribs = [
		...editorContribs,
		...workspaceContribs,
		...variableContribs,
	];

	return {
		id: "workspace",
		windows: ["workspace"],
		commands: allContribs,
		intentHandlers: [
			{
				id: "workspace.commands",
				intentTypes: allContribs.map((c) => c.intentType),
				handle(intent, ctx) {
					return deps.onCommand(intent, ctx.scope);
				},
			},
		],
	};
}
