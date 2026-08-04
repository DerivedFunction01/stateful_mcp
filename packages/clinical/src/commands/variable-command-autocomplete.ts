import type { CommandSyntaxProfile } from "./command-syntax-profile";

export interface VariableCommandAutocompleteContext {
	input: string;
	cursorOffset: number;
	profile: CommandSyntaxProfile;
}

export interface VariableCommandSuggestion {
	kind: "operation" | "variable-name" | "expression";
	label: string;
	insertText: string;
	operation?: string;
	detail?: string;
}

export async function getVariableCommandSuggestions(
	context: VariableCommandAutocompleteContext,
): Promise<VariableCommandSuggestion[]> {
	const { profile } = context;
	const input = context.input.slice(0, context.cursorOffset);
	const prefix = `${profile.variableCommandToken}${profile.variableCommandName}`;
	if (!input.startsWith(prefix)) return [];
	const rest = input.slice(prefix.length);
	const parts = rest.trimStart().split(/\s+/);
	const operationPrefix = rest.trimStart();
	if (!rest.includes(" ") && !rest.endsWith("\t"))
		return Object.entries(profile.variableCommandMappings)
			.filter(([label]) => label.startsWith(operationPrefix))
			.map(([label, operation]) => ({
				kind: "operation",
				label,
				insertText: label,
				operation,
			}));
	const operation = profile.variableCommandMappings[parts[0] ?? ""];
	// Operation values are locale-neutral semantic enums; the typed command
	// token comes from the active profile mapping, not an English keyword.
	if (
		operation &&
		(operation === "set" || operation === "update") &&
		rest.trimEnd().endsWith(parts[0]!)
	)
		return [
			{ kind: "variable-name", label: "name=", insertText: "name=", operation },
		];
	return [];
}
