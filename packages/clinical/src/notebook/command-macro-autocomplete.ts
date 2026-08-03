import type { AutocompleteSuggestion } from "./command-autocomplete";
import type { ParserCommandMacro, ParserCommandMacroStore } from "../store/parser/command-macros/interfaces";
import { renderCommandMacroTemplate, nextEmptyMacroSlot, type MacroSlotState } from "../parser/command/command-macro-authoring-template";

function suggestion(macro: ParserCommandMacro): AutocompleteSuggestion {
	return {
		verb: `^${macro.macroName}`,
		group: "macro",
		source: "cell",
		hasArgs: macro.arguments.length > 0,
		argNames: macro.arguments.map((argument) => argument.name),
		argHints: macro.arguments.map((argument) => argument.autocomplete ? [argument.autocomplete.source] : []),
		argsRequired: macro.arguments.map((argument) => argument.required ?? false),
		kind: "verb",
		descriptionKey: macro.description,
	};
}

export async function getCommandMacroAutocomplete(
	partial: string,
	store: ParserCommandMacroStore,
	context?: { personnelId?: string; profileId?: string },
): Promise<AutocompleteSuggestion[]> {
	const macros = await store.list(context);
	const text = partial.trimStart();
	const macroPrefix = text.startsWith("^") ? text.slice(1).split(/\s+/, 1)[0] ?? "" : text.split(/\s+/, 1)[0] ?? "";
	return macros
		.filter((macro) => macro.macroName.toLocaleLowerCase().startsWith(macroPrefix.toLocaleLowerCase()))
		.sort((a, b) => a.macroName.length - b.macroName.length || a.macroName.localeCompare(b.macroName))
		.slice(0, 16)
		.map(suggestion);
}

export function getMacroArgumentAutocomplete(macro: ParserCommandMacro, input: string): AutocompleteSuggestion[] {
	const current = input.trim().split(/\s+/).at(-1) ?? "";
	const normalized = current.toLocaleLowerCase();
	return macro.arguments
		.filter((argument) => argument.name.toLocaleLowerCase().startsWith(normalized) || argument.aliases?.some((alias) => alias.toLocaleLowerCase().startsWith(normalized)))
		.map((argument, index) => ({
			verb: `${argument.name}=`, group: "macro-argument", source: "cell" as const, hasArgs: false,
			kind: "arg" as const, argIndex: index, argName: argument.name,
			descriptionKey: argument.autocomplete?.source,
		}));
}

export function renderMacroAuthoringSuggestion(
	macro: ParserCommandMacro,
	values: ReadonlyMap<string, string> = new Map(),
): { text: string; activeSlot?: MacroSlotState } | undefined {
	if (!macro.authoringTemplate) return undefined;
	const rendered = renderCommandMacroTemplate(macro.authoringTemplate, values);
	return { text: rendered.text, activeSlot: nextEmptyMacroSlot(rendered.slots) };
}
