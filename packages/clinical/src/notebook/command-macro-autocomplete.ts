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

export async function getCommandMacroContextualAutocomplete(
	partial: string,
	store: ParserCommandMacroStore,
	context?: { personnelId?: string; profileId?: string },
): Promise<AutocompleteSuggestion[]> {
	const text = partial.trimStart();
	const words = text.split(/\s+/);
	const macroName = (words[0] ?? "").replace(/^\^/, "");
	if (words.length <= 1) return getCommandMacroAutocomplete(partial, store, context);
	const macro = await store.get(macroName, context);
	return macro ? getMacroArgumentAutocomplete(macro, text) : [];
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

export interface CompatibleMacroSuggestion {
	macro: ParserCommandMacro;
	compatibility: "declared-child" | "same-target-schema";
	staticReason: string;
}

/** Deterministic eligibility projection for future learning-based ranking. */
export async function getCompatibleCommandMacros(
	current: ParserCommandMacro,
	store: ParserCommandMacroStore,
	context?: { personnelId?: string; profileId?: string },
): Promise<CompatibleMacroSuggestion[]> {
	const declaredChildren = new Set((current.children ?? []).map((child) => child.childMacroName));
	const macros = await store.list(context);
	return macros.flatMap<CompatibleMacroSuggestion>((macro) => {
		if (declaredChildren.has(macro.macroName)) return [{ macro, compatibility: "declared-child", staticReason: "declared child macro" }];
		if (macro.root.targetSchema === current.root.targetSchema && macro.macroId !== current.macroId) return [{ macro, compatibility: "same-target-schema", staticReason: "same target schema" }];
		return [];
	});
}
