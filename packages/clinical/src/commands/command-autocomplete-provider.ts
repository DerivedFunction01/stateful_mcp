import type { MacroStore } from "../macros/macro-definition";
import type { SchemaRegistry } from "../schemas/schema-registry";
import type {
	CommandAutocompleteContext,
	CommandSuggestion,
} from "./command-bar-types";
import {
	createCommandSyntaxProfile,
	type CommandSyntaxProfile,
} from "./command-syntax-profile";

export async function getCommandBarSuggestions(
	context: CommandAutocompleteContext,
	options: { macroStore?: MacroStore; schemaRegistry?: SchemaRegistry } = {},
	profile: CommandSyntaxProfile = createCommandSyntaxProfile({
		profileId: "v2-default",
	}),
): Promise<CommandSuggestion[]> {
	const input = context.input.slice(0, context.cursorOffset);
	if (input.startsWith(profile.macroStartToken))
		return macroSuggestions(input, options.macroStore, profile);
	if (!input.startsWith(profile.directCommandToken)) return [];
	const commandText = input.slice(profile.directCommandToken.length);
	const [verb = "", ...args] = commandText.split(/\s+/);
	if (args.length === 0 || (args.length === 1 && !commandText.endsWith(" "))) {
		return [
			profile.variableCommandName,
			...Object.keys({
				...profile.editorCommandMappings,
				...profile.directCommandMappings,
			}),
		]
			.filter((command) => command.startsWith(verb))
			.map((command) => ({
				label: `${profile.directCommandToken}${command}`,
				insertText: `${profile.directCommandToken}${command}`,
				kind: "command" as const,
				source: "static" as const,
			}));
	}
	if (
		["confirm", "rule_out", "suspend", "re_activate", "complete"].includes(verb)
	) {
		const prefix = args[0] ?? "";
		return (context.branches ?? [])
			.flatMap((branch) =>
				[branch.commandAlias, branch.name, branch.id].filter(
					(value): value is string => Boolean(value),
				),
			)
			.filter(
				(value, index, values) =>
					values.indexOf(value) === index &&
					value.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()),
			)
			.map((value) => ({
				label: value,
				insertText: value,
				kind: "branch" as const,
				source: "context" as const,
			}));
	}
	if (
		verb === "branch" &&
		args.some((arg) => arg === "concept=" || arg.startsWith("concept="))
	)
		return [];
	if (verb === "branch")
		return [
			{
				label: "concept=",
				insertText: "concept=",
				kind: "argument",
				source: "static",
			},
		];
	if (options.schemaRegistry && verb === "field")
		return options.schemaRegistry
			.list()
			.flatMap((schema) =>
				Object.keys(schema.fields).map((path) => ({
					label: path,
					insertText: path,
					kind: "field" as const,
					detail: schema.schema,
					source: "context" as const,
				})),
			);
	return [];
}

async function macroSuggestions(
	input: string,
	store: MacroStore | undefined,
	profile: CommandSyntaxProfile,
): Promise<CommandSuggestion[]> {
	if (!store) return [];
	const prefix =
		input.slice(profile.macroStartToken.length).split(/\s+/)[0] ?? "";
	const definitions = await store.list();
	return definitions
		.filter(
			(definition) =>
				definition.active && definition.macroName.startsWith(prefix),
		)
		.map((definition) => ({
			label: `${profile.macroStartToken}${definition.macroName}`,
			insertText: `${profile.macroStartToken}${definition.macroName}`,
			kind: "macro" as const,
			detail: definition.description,
			source: "context" as const,
		}));
}
