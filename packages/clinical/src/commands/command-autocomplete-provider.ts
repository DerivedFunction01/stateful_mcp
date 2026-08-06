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
			conceptCodeSeparator: profile.conceptCodeSeparator,
		});

		// B. Concept-token override. Custom-expression tokens are not concept searches.

		// Find active argument if specified
		const activeArg = context.activeArgumentId
			? definition.arguments.find(
					(a) => a.argumentId === context.activeArgumentId,
				)
			: undefined;

		const isActiveArgConcept =
			activeArg &&
			(activeArg.extraction.kind === "concept" ||
				activeArg.extraction.kind === "concept_array");

		// A. Explicit value autocomplete: e.g. argName=val
		if (currentWord.includes("=")) {
			const eqIndex = currentWord.indexOf("=");
			const argumentName = currentWord.slice(0, eqIndex);
			const valuePrefix = currentWord.slice(eqIndex + 1);

			const targetArgSpec = definition.arguments.find(
				(a) =>
					a.name === argumentName ||
					a.roleName === argumentName ||
					a.aliases?.includes(argumentName),
			);
			const targetArgConcept =
				targetArgSpec &&
				(targetArgSpec.extraction.kind === "concept" ||
					targetArgSpec.extraction.kind === "concept_array");

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
				argumentId: targetArgSpec?.argumentId,
				macroEvidence: s.macro?.evidence,
				sourceKind: s.source,
				provenance: targetArgConcept
					? ("expression" as const)
					: targetArgSpec?.extraction?.kind === "scalar"
						? ("numeric" as const)
						: ("argument-name" as const),
				expressionId: s.expressionId,
				conceptId: s.conceptId,
				lookupTerm: s.lookupTerm,
			}));
		}

		// B. Concept-token override.
		const isTokenMatch =
			(profile.conceptToken &&
				currentWord
					.toLocaleLowerCase()
					.startsWith(profile.conceptToken.toLocaleLowerCase())) ||
			(profile.expressionToken &&
				currentWord
					.toLocaleLowerCase()
					.startsWith(profile.expressionToken.toLocaleLowerCase()));

		if (isTokenMatch && (!context.activeArgumentId || isActiveArgConcept)) {
			const suggestions = await autocompleter.suggest({
				query: currentWord,
				macroName,
				argumentName: activeArg?.name,
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
				argumentId: activeArg?.argumentId,
				macroEvidence: s.macro?.evidence,
				sourceKind: s.source,
				provenance: "expression" as const,
				expressionId: s.expressionId,
				conceptId: s.conceptId,
				lookupTerm: s.lookupTerm,
			}));
		}

		// C. Suggest allowed values of all arguments matching prefix (natural typing)
		// Only run value suggestions when there is an actual query to filter by.
		// Empty query in discovery mode is handled by templates + argument names below.
		const valueSuggestions: CommandSuggestion[] = [];
		if (!context.activeArgumentId) {
			const macroBodyStart = profile.macroStartToken.length + macroName.length;
			const macroBody = input.slice(macroBodyStart);
			const phraseQuery = macroBody.trim();
			const leadingWhitespace = macroBody.match(/^\s*/)?.[0] ?? " ";
			const phraseInsertPrefix =
				input.slice(0, macroBodyStart) + (leadingWhitespace || " ");

			// Preserve a multi-word prefix while it still matches a template or
			// expression. If it stops matching, discovery falls back to the last
			// word below (for example, `My has` -> `has page #`).
			if (phraseQuery && phraseQuery !== currentWord) {
				const phraseTemplates = await autocompleter.suggest({
					query: phraseQuery,
					scope: "template",
					macroName,
					macroId: definition.macroId,
					macroVersion: definition.version,
					filledSlots: context.filledSlots,
				});
				const phraseValues = await Promise.all(
					definition.arguments
						.filter(
							(argument) => !context.filledSlots?.includes(argument.argumentId),
						)
						.map(async (argument) => ({
							argument,
							suggestions: await (autocompleter as any).suggestValueForArgument(
								argument,
								phraseQuery,
							),
						})),
				);
				const phraseMatches: CommandSuggestion[] = [
					...phraseTemplates.map((suggestion) => ({
						label: suggestion.label,
						insertText: phraseInsertPrefix + suggestion.value,
						kind: "value" as const,
						detail: suggestion.detail,
						source: "context" as const,
						sourceKind: suggestion.source,
						provenance: "template" as const,
						argumentId: suggestion.argumentId,
					})),
					...phraseValues.flatMap(({ argument, suggestions }) => {
						const isConcept =
							argument.extraction.kind === "concept" ||
							argument.extraction.kind === "concept_array";
						return suggestions.map((suggestion: any) => ({
							label: suggestion.label,
							insertText: phraseInsertPrefix + suggestion.value,
							kind: "value" as const,
							detail: suggestion.detail,
							source: "context" as const,
							sourceKind: suggestion.source,
							provenance: isConcept
								? ("expression" as const)
								: argument.extraction.kind === "scalar"
									? ("numeric" as const)
									: ("argument-name" as const),
							argumentId: argument.argumentId,
							expressionId: suggestion.expressionId,
							conceptId: suggestion.conceptId,
							lookupTerm: suggestion.lookupTerm,
						}));
					}),
				];
				if (phraseMatches.length > 0) return phraseMatches;
			}
		}
		if (context.activeArgumentId) {
			if (activeArg) {
				const suggestions = await (
					autocompleter as any
				).suggestValueForArgument(activeArg, currentWord);
				const isConcept =
					activeArg.extraction.kind === "concept" ||
					activeArg.extraction.kind === "concept_array";
				for (const s of suggestions) {
					valueSuggestions.push({
						label: s.label,
						insertText: input.slice(0, lastSpaceIndex + 1) + s.value,
						kind: "value" as const,
						detail: `${activeArg.roleName}: ${s.detail || ""}`,
						source: "context" as const,
						sourceKind: s.source,
						provenance: isConcept
							? "expression"
							: activeArg.extraction.kind === "scalar"
								? "numeric"
								: "argument-name",
						argumentId: activeArg.argumentId,
						expressionId: s.expressionId,
						conceptId: s.conceptId,
						lookupTerm: s.lookupTerm,
					});
				}
			}
		} else {
			if (currentWord.trim()) {
				// Discovery mode: only suggest values when there is a non-empty prefix to filter by
				for (const argument of definition.arguments) {
					const suggestions = await (
						autocompleter as any
					).suggestValueForArgument(argument, currentWord);
					const isConcept =
						argument.extraction.kind === "concept" ||
						argument.extraction.kind === "concept_array";
					for (const s of suggestions) {
						valueSuggestions.push({
							label: s.label,
							insertText: input.slice(0, lastSpaceIndex + 1) + s.value,
							kind: "value" as const,
							detail: `${argument.roleName}: ${s.detail || ""}`,
							source: "context" as const,
							sourceKind: s.source,
							provenance: isConcept
								? "expression"
								: argument.extraction.kind === "scalar"
									? "numeric"
									: "argument-name",
							argumentId: argument.argumentId,
							expressionId: s.expressionId,
							conceptId: s.conceptId,
							lookupTerm: s.lookupTerm,
						});
					}
				}
			}
			const templateSuggestions = await autocompleter.suggest({
				query: currentWord,
				scope: "template",
				macroName,
				macroId: definition.macroId,
				macroVersion: definition.version,
				filledSlots: context.filledSlots,
			});
			for (const suggestion of templateSuggestions) {
				valueSuggestions.push({
					label: suggestion.label,
					insertText: input.slice(0, lastSpaceIndex + 1) + suggestion.value,
					kind: "value" as const,
					detail: suggestion.detail,
					source: "context" as const,
					sourceKind: suggestion.source,
					provenance: "template" as const,
					argumentId: suggestion.argumentId,
				});
			}
		}

		if (!context.activeArgumentId) {
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
			const mappedArgs = argumentSuggestions.map((suggestion) => ({
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
				provenance: "argument-name" as const,
			}));
			return [...valueSuggestions, ...mappedArgs];
		}

		return valueSuggestions;
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
