import type { DictionaryStore, ConceptFilterStore } from "@stateful-mcp/core";
import type { UnifiedProfileStore } from "../stores/profiles/profile-store";
import type { ValueRule } from "../values/value-rule-registry";
import { ValueRuleRegistry } from "../values/value-rule-registry";
import type { MacroDefinition, MacroStore } from "../macros/macro-definition";
import { compileSetupMacro } from "./setup-compiler";
import { validateSetupSource } from "./setup-validator";
import type { SetupSourceDocument } from "./setup-types";
import { applySetupPrimitiveProfile } from "./setup-profile";

export interface SetupMaterializerDeps {
	dictionary: DictionaryStore;
	conceptFilterStore?: ConceptFilterStore;
	macroStore: MacroStore & { set(macro: MacroDefinition): Promise<void> };
	profileStore?: UnifiedProfileStore;
	valueRules?: ValueRuleRegistry;
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
		if (deps.profileStore) {
			await deps.profileStore.set({
				profileId: `${source.profileId}:numerical`,
				kind: "numerical",
				active: true,
			payload: source.primitiveProfile.baseNumericalProfile
				? applySetupPrimitiveProfile(
					source.primitiveProfile.baseNumericalProfile,
					source.primitiveProfile,
				)
				: source.primitiveProfile,
			});
		}
		const generatedRules = source.blocks.flatMap(toGeneratedValueRules);
		if (deps.valueRules && generatedRules.length > 0) {
			const profileId = `${source.profileId}:values`;
			const pending = generatedRules.filter(
				(rule) => !deps.valueRules!.get(profileId, rule.ruleId),
			);
			if (pending.length > 0) deps.valueRules.register(profileId, pending);
		}
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

function toGeneratedValueRules(block: SetupSourceDocument["blocks"][number]): ValueRule[] {
	if (block.source.kind !== "generated" || !block.source.recipe.phrases?.length)
		return [];
	const boundary = block.source.recipe.wordBoundary ?? "none";
	const prefix = boundary === "before" || boundary === "both" ? "(?<![\\p{L}\\p{N}_])" : "";
	const suffix = boundary === "after" || boundary === "both" ? "(?![\\p{L}\\p{N}_])" : "";
	const patterns = block.source.recipe.phrases.map(
		(phrase) => `${prefix}${phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}${suffix}`,
	);
	return [{
		ruleId: block.blockId,
		targetSchema: block.target.targetSchema,
		targetPath: block.target.targetPath,
		valueKind: block.valueKind as ValueRule["valueKind"],
		patterns,
		caseInsensitive: block.source.recipe.caseSensitive !== true,
		priority: block.version,
	}];
}
