import type { CommandSyntaxProfile } from "@stateful-mcp/clinical/commands/command-syntax-profile";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import type { CommandDescriptor } from "../../editor/command-descriptor";
import type {
	EditorExtension,
	WindowEffect,
	WindowIntent,
	WindowScope,
} from "../../runtime/extension";
import { descriptorsToContributions } from "../notebook/extension";
import { getSharedCellCommandDescriptors } from "../shared-cell-commands";

export interface WorkspaceProfileDeps {
	profile: CommandSyntaxProfile;
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
	const workspaceDescriptors: CommandDescriptor[] = [
		{
			verb: "branch",
			aliases: [],
			group: "workspace",
			descriptionKey: "workspace.branch",
			args: [],
		},
		{
			verb: "confirm",
			aliases: [],
			group: "workspace",
			descriptionKey: "workspace.confirm",
			args: [],
		},
		{
			verb: "complete",
			aliases: [],
			group: "workspace",
			descriptionKey: "workspace.complete",
			args: [],
		},
	];
	const variableDescriptors = getSharedCellCommandDescriptors();

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
