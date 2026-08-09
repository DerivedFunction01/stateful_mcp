import type { DictionaryStore, ConceptFilterStore } from "@stateful-mcp/core";
import type { MacroDefinition, MacroStore } from "../macros/macro-definition";
import { compileSetupMacro } from "./setup-compiler";
import { validateSetupSource } from "./setup-validator";
import type { SetupSourceDocument } from "./setup-types";

export interface SetupMaterializerDeps {
	dictionary: DictionaryStore;
	conceptFilterStore?: ConceptFilterStore;
	macroStore: MacroStore & { set(macro: MacroDefinition): Promise<void> };
}

export interface SetupMaterializationResult {
	applied: boolean;
	concepts: number;
	expressions: number;
	filters: number;
	macros: number;
	diagnostics: string[];
}

export async function materializeSetupSource(
	source: SetupSourceDocument,
	deps: SetupMaterializerDeps,
): Promise<SetupMaterializationResult> {
	const validation = validateSetupSource(source);
	if (!validation.valid) {
		return {
			applied: false,
			concepts: 0,
			expressions: 0,
			filters: 0,
			macros: 0,
			diagnostics: validation.diagnostics.map((diagnostic) => diagnostic.message),
		};
	}

	try {
		await deps.dictionary.loadConfig({
			concepts: source.concepts.map((concept) => ({
				id: concept.conceptId,
				namespaceCode: concept.namespaceCode,
				standardCode: concept.standardCode,
				display: concept.display,
				active: true,
			})),
			expressions: source.expressions,
			conceptFilters: source.conceptFilters,
		});
		if (deps.conceptFilterStore) {
			for (const filter of source.conceptFilters)
				await deps.conceptFilterStore.set(filter);
		}
		for (const composition of source.macros) {
			const macro = composition.generatedMacro ??
				compileSetupMacro(composition, source.blocks);
			await deps.macroStore.set(macro);
		}
		return {
			applied: true,
			concepts: source.concepts.length,
			expressions: source.expressions.length,
			filters: source.conceptFilters.length,
			macros: source.macros.length,
			diagnostics: [],
		};
	} catch (error) {
		return {
			applied: false,
			concepts: 0,
			expressions: 0,
			filters: 0,
			macros: 0,
			diagnostics: [error instanceof Error ? error.message : String(error)],
		};
	}
}
