import { aliasesDiagnostic } from "./compiler-helpers";
import type {
	AliasDefinition,
	AliasDiagnostic,
	AliasNamespace,
	AliasResolver,
	CompiledAliasEntry,
} from "./contracts";
import { ALIAS_NAMESPACES } from "./namespaces";

export interface AliasCompilationState {
	readonly diagnostics: AliasDiagnostic[];
	readonly namespaces: Partial<Record<AliasNamespace, CompiledAliasEntry[]>>;
	readonly seenIds: Set<string>;
	readonly seenSpellings: Map<string, string>;
}

export function compileAliasDefinition(
	definition: AliasDefinition,
	resolvers: Readonly<Record<string, AliasResolver>>,
	state: AliasCompilationState,
): void {
	if (!definition?.id || typeof definition.id !== "string") {
		state.diagnostics.push(
			aliasesDiagnostic(
				"ALIAS_INVALID_DEFINITION",
				"aliases.invalidDefinition",
				{ reason: "missing-id" },
			),
		);
		return;
	}
	if (!definition.namespace || !(definition.namespace in ALIAS_NAMESPACES)) {
		state.diagnostics.push(
			aliasesDiagnostic(
				"ALIAS_INVALID_DEFINITION",
				"aliases.invalidDefinition",
				{ reason: "invalid-namespace", id: definition.id },
				{ definitionId: definition.id },
			),
		);
		return;
	}
	if (
		!Array.isArray(definition.spellings) ||
		definition.spellings.length === 0
	) {
		state.diagnostics.push(
			aliasesDiagnostic(
				"ALIAS_INVALID_DEFINITION",
				"aliases.invalidDefinition",
				{ reason: "missing-spellings", id: definition.id },
				{ definitionId: definition.id, namespace: definition.namespace },
			),
		);
		return;
	}
	if (state.seenIds.has(definition.id)) {
		state.diagnostics.push(
			aliasesDiagnostic(
				"ALIAS_DUPLICATE_ID",
				"aliases.duplicateId",
				{ id: definition.id },
				{ definitionId: definition.id, namespace: definition.namespace },
			),
		);
		return;
	}
	state.seenIds.add(definition.id);
	if (
		definition.target.kind === "resolver" &&
		!resolvers[definition.target.resolverId]
	) {
		state.diagnostics.push(
			aliasesDiagnostic(
				"ALIAS_UNKNOWN_RESOLVER",
				"aliases.unknownResolver",
				{ id: definition.id, resolverId: definition.target.resolverId },
				{ definitionId: definition.id, namespace: definition.namespace },
			),
		);
		return;
	}
	const caseSensitive = definition.caseSensitive ?? true;
	const boundary = definition.boundary ?? "none";
	const bucket = state.namespaces[definition.namespace] ?? [];
	state.namespaces[definition.namespace] = bucket;
	for (const spelling of definition.spellings) {
		const key = `${definition.namespace}:${caseSensitive ? spelling : spelling.toLowerCase()}`;
		const existing = state.seenSpellings.get(key);
		if (existing !== undefined && existing !== definition.id)
			state.diagnostics.push(
				aliasesDiagnostic(
					"ALIAS_CONFLICTING_SPELLING",
					"aliases.conflictingSpelling",
					{
						namespace: definition.namespace,
						spelling,
						firstId: existing,
						secondId: definition.id,
					},
					{
						definitionId: definition.id,
						namespace: definition.namespace,
						spelling,
					},
				),
			);
		else state.seenSpellings.set(key, definition.id);
		bucket.push({
			definitionId: definition.id,
			spelling,
			caseSensitive,
			boundary,
			target: definition.target,
		});
	}
}
