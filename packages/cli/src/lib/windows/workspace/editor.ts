import type { CommandSyntaxProfile } from "@stateful-mcp/clinical/commands/command-syntax-profile";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import type { AutocompleteSuggestion } from "../../editor/autocomplete";
import type { CommandDescriptor, } from "../../editor/command-descriptor";
import type { CommandCatalog, EditorContext } from "../../editor";

const WORKSPACE_COMMANDS: CommandDescriptor[] = [
	{ verb: "branch", aliases: [], group: "workspace", descriptionKey: "workspace.branch", args: [] },
	{ verb: "confirm", aliases: [], group: "workspace", descriptionKey: "workspace.confirm", args: [] },
	{ verb: "rule_out", aliases: ["ruleout"], group: "workspace", descriptionKey: "workspace.ruleOut", args: [] },
	{ verb: "suspend", aliases: [], group: "workspace", descriptionKey: "workspace.suspend", args: [] },
	{ verb: "re_activate", aliases: ["reactivate"], group: "workspace", descriptionKey: "workspace.reactivate", args: [] },
	{ verb: "close", aliases: [], group: "workspace", descriptionKey: "workspace.close", args: [] },
	{ verb: "complete", aliases: [], group: "workspace", descriptionKey: "workspace.complete", args: [] },
];

function suggestion(label: string, group: string, kind: "verb" | "arg" = "verb"): AutocompleteSuggestion {
	return {
		label,
		value: label,
		type: kind === "arg" ? "argument" : "command",
		completionText: label,
		verb: label,
		group,
		source: "clinical",
		hasArgs: false,
		kind,
	};
}

export class WorkspaceCommandCatalog implements CommandCatalog {
	constructor(
		private readonly _profile: CommandSyntaxProfile | null,
		private readonly _snapshot: WorkspaceSnapshot | null,
	) {}

	getDescriptors(_context: EditorContext): CommandDescriptor[] {
		return [...WORKSPACE_COMMANDS];
	}

	getSuggestions(partial: string, _context: EditorContext): AutocompleteSuggestion[] {
		const verb = partial.split(" ")[0] ?? "";
		return WORKSPACE_COMMANDS
			.filter((command) => [command.verb, ...command.aliases].some((value) => value.startsWith(verb)))
			.map((command) => suggestion(command.verb, command.group));
	}
}
