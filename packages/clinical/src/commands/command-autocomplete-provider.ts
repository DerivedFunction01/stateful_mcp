import type { MacroLearningService } from "../learning/macro-learning-service";
import { MacroAutocomplete } from "../macros/macro-autocomplete";
import type { MacroStore } from "../macros/macro-definition";
import type { SchemaRegistry } from "../schemas/schema-registry";
import type {
	CommandAutocompleteContext,
	CommandSuggestion,
} from "./command-bar-types";
import {
	type CommandSyntaxProfile,
	createCommandSyntaxProfile,
} from "./command-syntax-profile";

export async function getCommandBarSuggestions(
	context: CommandAutocompleteContext,
	options: {
		macroStore?: MacroStore;
		schemaRegistry?: SchemaRegistry;
		dictionary?: any;
		learningService?: MacroLearningService;
	} = {},
	profile: CommandSyntaxProfile = createCommandSyntaxProfile({
		profileId: "v2-default",
	}),
): Promise<CommandSuggestion[]> {
	const input = context.input.slice(0, context.cursorOffset);
	if (input.startsWith(profile.macroStartToken))
		return macroSuggestions(
			input,
			options.macroStore,
			profile,
			context,
			options,
		);
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
		return options.schemaRegistry.list().flatMap((schema) =>
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
	context: CommandAutocompleteContext,
	options: {
		macroStore?: MacroStore;
		schemaRegistry?: SchemaRegistry;
		dictionary?: any;
		learningService?: MacroLearningService;
	} = {},
): Promise<CommandSuggestion[]> {
	if (!store) return [];
	const prefix =
		input.slice(profile.macroStartToken.length).split(/\s+/)[0] ?? "";
	const definitions = await store.list();
	const macroName =
		input.slice(profile.macroStartToken.length).trim().split(/\s+/)[0] ?? "";
	if (input.slice(profile.macroStartToken.length).includes(" ")) {
		const definition = definitions.find(
			(item) => item.active && item.macroName === macroName,
		);
		if (!definition) return [];

		const lastSpaceIndex = input.lastIndexOf(" ");
		const currentWord =
			lastSpaceIndex === -1 ? "" : input.slice(lastSpaceIndex + 1);

		const autocompleter = new MacroAutocomplete({
			macros: store,
			dictionary: options.dictionary,
			filterStore:
				options.dictionary?.resolver?.options?.filterStore ||
				options.dictionary?.filterStore ||
				options.dictionary?.resolver?.filterStore,
			learningService: options.learningService,
			conceptToken: profile.conceptToken,
			expressionToken: profile.expressionToken,
			conceptNamespaceSeparator: profile.conceptNamespaceSeparator,
		});

		// A. Explicit value autocomplete: e.g. argName=val
		if (currentWord.includes("=")) {
			const eqIndex = currentWord.indexOf("=");
			const argumentName = currentWord.slice(0, eqIndex);
			const valuePrefix = currentWord.slice(eqIndex + 1);

			const suggestions = await autocompleter.suggest({
				query: valuePrefix,
				macroName,
				argumentName,
				macroId: definition.macroId,
				macroVersion: definition.version,
				filledSlots: context.filledSlots,
				previousSlot: context.previousSlot,
				personnelId: context.personnelId,
			});

			return suggestions.map((s) => ({
				label: s.label,
				insertText:
					input.slice(0, lastSpaceIndex + 1) + argumentName + "=" + s.value,
				kind: "value" as const,
				detail: s.detail,
				source: "context" as const,
				macroId: definition.macroId,
				macroVersion: definition.version,
				argumentId: definition.arguments.find(
					(argument) =>
						argument.name === argumentName ||
						argument.roleName === argumentName ||
						argument.aliases?.includes(argumentName),
				)?.argumentId,
				macroEvidence: s.macro?.evidence,
				sourceKind: s.source,
				expressionId: s.expressionId,
				conceptId: s.conceptId,
				lookupTerm: s.lookupTerm,
			}));
		}

		// B. Concept-token override. Custom-expression tokens are not concept searches.
		if (
			(profile.conceptToken && currentWord.startsWith(profile.conceptToken)) ||
			(profile.expressionToken &&
				currentWord.startsWith(profile.expressionToken))
		) {
			const suggestions = await autocompleter.suggest({
				query: currentWord,
				macroName,
				macroId: definition.macroId,
				macroVersion: definition.version,
				filledSlots: context.filledSlots,
				previousSlot: context.previousSlot,
				personnelId: context.personnelId,
			});
			return suggestions.map((s) => ({
				label: s.label,
				insertText: input.slice(0, lastSpaceIndex + 1) + s.value,
				kind: "value" as const,
				detail: s.detail,
				source: "context" as const,
				macroId: definition.macroId,
				macroVersion: definition.version,
				macroEvidence: s.macro?.evidence,
				sourceKind: s.source,
				expressionId: s.expressionId,
				conceptId: s.conceptId,
				lookupTerm: s.lookupTerm,
			}));
		}

		// C. Suggest allowed values of all arguments matching prefix (natural typing)
		const valueSuggestions: CommandSuggestion[] = [];
		for (const argument of definition.arguments) {
			const suggestions = await (autocompleter as any).suggestValueForArgument(
				argument,
				currentWord,
			);
			for (const s of suggestions) {
				valueSuggestions.push({
					label: s.label,
					insertText: input.slice(0, lastSpaceIndex + 1) + s.value,
					kind: "value" as const,
					detail: `${argument.roleName}: ${s.detail || ""}`,
					source: "context" as const,
					sourceKind: s.source,
					expressionId: s.expressionId,
					conceptId: s.conceptId,
					lookupTerm: s.lookupTerm,
				});
			}
		}

		if (valueSuggestions.length > 0) {
			return valueSuggestions;
		}

		const argumentSuggestions = await autocompleter.suggest({
			query: currentWord,
			scope: "argument",
			macroName,
			macroId: definition.macroId,
			macroVersion: definition.version,
			filledSlots: context.filledSlots,
			previousSlot: context.previousSlot,
			personnelId: context.personnelId,
		});
		return argumentSuggestions.map((suggestion) => ({
			label: `${suggestion.label}=`,
			insertText: `${suggestion.value}=`,
			kind: "argument" as const,
			detail: suggestion.detail ?? definition.description,
			source: "context" as const,
			argName: suggestion.value,
			macroId: definition.macroId,
			macroVersion: definition.version,
			argumentId: definition.arguments.find(
				(argument) => argument.name === suggestion.value,
			)?.argumentId,
			macroEvidence: suggestion.macro?.evidence,
		}));
	}
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
