import { compileAliasDefinition } from "./compile-definition";
import type {
	AliasDefinition,
	AliasDiagnostic,
	AliasNamespace,
	AliasResolver,
	CompiledAliasEntry,
	CompiledAliasRegistry,
} from "./contracts";

/** Compiles alias definitions into a per-namespace registry. Validates duplicate IDs, conflicting same-namespace spellings, unknown resolver IDs, and malformed definitions. Diagnostics use canonical ErrorDescriptor fields only. */
export function compileAliasRegistry(
	definitions: readonly AliasDefinition[],
	resolvers: Readonly<Record<string, AliasResolver>> = {},
): CompiledAliasRegistry {
	const diagnostics: AliasDiagnostic[] = [];
	const namespaces: Partial<Record<AliasNamespace, CompiledAliasEntry[]>> = {};
	const seenIds = new Set<string>();
	const seenSpellings = new Map<string, string>();
	const state = { diagnostics, namespaces, seenIds, seenSpellings };
	for (const definition of definitions) {
		compileAliasDefinition(definition, resolvers, state);
	}
	for (const namespace of Object.keys(namespaces) as AliasNamespace[]) {
		const entries = namespaces[namespace]!;
		entries.sort((first, second) => {
			if (second.spelling.length !== first.spelling.length)
				return second.spelling.length - first.spelling.length;
			if (first.spelling !== second.spelling)
				return first.spelling < second.spelling ? -1 : 1;
			return first.definitionId < second.definitionId ? -1 : 1;
		});
		namespaces[namespace] = [...Object.freeze(entries)];
	}
	return {
		namespaces: Object.freeze(namespaces),
		diagnostics: Object.freeze(diagnostics),
	};
}
