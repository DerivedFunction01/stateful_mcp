import type { CommandSyntaxProfile } from "@stateful-mcp/clinical/commands/command-syntax-profile";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import type { CommandCatalog, EditorContext } from "../../editor";
import type { AutocompleteSuggestion } from "../../editor/autocomplete";
import type { CommandDescriptor } from "../../editor/command-descriptor";

const WORKSPACE_COMMANDS: CommandDescriptor[] = [
	{
		verb: "branch",
		aliases: [],
		group: "workspace",
		descriptionKey: "workspace.branch",
		args: [{ name: "name" }, { name: "concept" }],
	},
	{
		verb: "confirm",
		aliases: [],
		group: "workspace",
		descriptionKey: "workspace.confirm",
		args: [{ name: "branch", required: true }],
	},
	{
		verb: "rule_out",
		aliases: ["ruleout"],
		group: "workspace",
		descriptionKey: "workspace.ruleOut",
		args: [{ name: "branch", required: true }, { name: "reason" }],
	},
	{
		verb: "suspend",
		aliases: [],
		group: "workspace",
		descriptionKey: "workspace.suspend",
		args: [{ name: "branch", required: true }, { name: "reason" }],
	},
	{
		verb: "re_activate",
		aliases: ["reactivate"],
		group: "workspace",
		descriptionKey: "workspace.reactivate",
		args: [{ name: "branch", required: true }],
	},
	{
		verb: "close",
		aliases: [],
		group: "workspace",
		descriptionKey: "workspace.close",
		args: [],
	},
	{
		verb: "complete",
		aliases: [],
		group: "workspace",
		descriptionKey: "workspace.complete",
		args: [{ name: "branch", required: true }],
	},
	{
		verb: "var",
		aliases: ["variable"],
		group: "workspace",
		descriptionKey: "command.variable",
		args: [{ name: "action" }, { name: "name" }, { name: "value" }],
	},
];

function suggestion(
	command: CommandDescriptor,
	kind: "verb" | "arg" = "verb",
): AutocompleteSuggestion {
	const argNames = (command.args ?? []).map((arg) => arg.name);
	const argsRequired = (command.args ?? []).map((arg) => arg.required ?? false);
	return {
		label: command.verb,
		value: command.verb,
		type: kind === "arg" ? "argument" : "command",
		completionText: command.verb,
		verb: command.verb,
		group: command.group,
		source: "clinical",
		hasArgs: argNames.length > 0,
		kind,
		argNames: argNames.length > 0 ? argNames : undefined,
		argsRequired: argNames.length > 0 ? argsRequired : undefined,
		descriptionKey: command.descriptionKey,
	};
}

export class WorkspaceCommandCatalog implements CommandCatalog {
	constructor(
		readonly _profile: CommandSyntaxProfile | null,
		readonly _snapshot: WorkspaceSnapshot | null,
	) {}

	getDescriptors(_context: EditorContext): CommandDescriptor[] {
		return [...WORKSPACE_COMMANDS];
	}

	getSuggestions(
		partial: string,
		_context: EditorContext,
	): AutocompleteSuggestion[] {
		const verb = partial.split(" ")[0] ?? "";
		return WORKSPACE_COMMANDS.filter((command) =>
			[command.verb, ...command.aliases].some((value) =>
				value.startsWith(verb),
			),
		).map((command) => suggestion(command));
	}
}
