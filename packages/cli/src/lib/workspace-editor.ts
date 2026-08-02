import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";
import { VariableCommandProvider } from "@stateful-mcp/clinical/session/variable-command-provider";
import { WorkspaceCommandProvider } from "@stateful-mcp/clinical/session/workspace-command-provider";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import type { ParserSyntaxProfile } from "@stateful-mcp/clinical/store/interfaces";
import type { CommandCatalog, EditorContext } from "./cell-editor";

function descriptorSuggestion(
	verb: string,
	descriptor: {
		group: string;
		args: { name: string; required: boolean; completions?: string[] }[];
		descriptionKey: string;
	},
): AutocompleteSuggestion {
	return {
		verb,
		group: descriptor.group,
		source: "cell",
		hasArgs: descriptor.args.length > 0,
		argNames: descriptor.args.map((arg) => arg.name),
		argHints: descriptor.args.map((arg) => arg.completions ?? []),
		argsRequired: descriptor.args.map((arg) => arg.required),
		kind: "verb",
		descriptionKey: descriptor.descriptionKey,
	};
}

export class WorkspaceCommandCatalog implements CommandCatalog {
	private readonly workspace: WorkspaceCommandProvider;
	private readonly variables = new VariableCommandProvider();
	private readonly editor: CommandDescriptor[];

	constructor(
		profile: ParserSyntaxProfile,
		private readonly snapshot: WorkspaceSnapshot | null,
	) {
		this.workspace = new WorkspaceCommandProvider(profile);
		this.editor = EditorCommandRegistry.createDefault().getDescriptors();
	}

	getDescriptors(_context: EditorContext) {
		const seen = new Set<string>();
		const out: CommandDescriptor[] = [];
		for (const descriptor of [
			...this.editor,
			...this.workspace.getDescriptors(),
			...this.variables.getDescriptors(),
		]) {
			if (seen.has(descriptor.verb)) continue;
			seen.add(descriptor.verb);
			out.push(descriptor);
		}
		return out;
	}

	getSuggestions(
		partial: string,
		context: EditorContext,
	): AutocompleteSuggestion[] {
		const descriptors = this.getDescriptors(context);
		const space = partial.indexOf(" ");
		if (space < 0) {
			const values: AutocompleteSuggestion[] = [];
			for (const descriptor of descriptors) {
				for (const verb of [descriptor.verb, ...descriptor.aliases]) {
					if (verb.startsWith(partial)) {
						values.push(descriptorSuggestion(verb, descriptor));
					}
				}
			}
			return values.slice(0, 12);
		}

		const verb = partial.slice(0, space);
		const afterVerb = partial.slice(space + 1);
		const args = afterVerb.split(" ");
		const argIndex = Math.max(0, args.length - 1);
		const prefix = args[argIndex] ?? "";
		const variableDescriptor = descriptors.find(
			(descriptor) =>
				descriptor.verb === "var" &&
				(verb === "var" || descriptor.aliases.includes(verb)),
		);
		if (variableDescriptor && argIndex === 0) {
			return (variableDescriptor.args[0]?.completions ?? [])
				.filter((value) => value.startsWith(prefix))
				.map((value) => ({
					verb: value,
					group: variableDescriptor.group,
					source: "cell" as const,
					hasArgs: false,
					kind: "arg" as const,
					argIndex,
					argName: variableDescriptor.args[0]?.name,
					descriptionKey: variableDescriptor.args[0]?.descriptionKey,
				}));
		}

		const values = this.workspace
			.getArgumentCompletions(verb, argIndex, this.snapshot)
			.filter((value) => value.startsWith(prefix));
		const descriptor = descriptors.find(
			(candidate) =>
				candidate.verb === verb || candidate.aliases.includes(verb),
		);
		return values.map((value) => ({
			verb: value,
			group: descriptor?.group ?? "workspace",
			source: "cell" as const,
			hasArgs: false,
			kind: "arg" as const,
			argIndex,
			argName: descriptor?.args[argIndex]?.name,
			descriptionKey: descriptor?.args[argIndex]?.descriptionKey,
		}));
	}
}
