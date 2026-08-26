import type {
	AliasNamespace,
	AliasResolution,
	AliasResolver,
	AliasTarget,
	CompiledAliasRegistry,
	ResolvedTarget,
	ResolverContext,
} from "./contracts";
import { spellingMatches } from "./matching";

function resolveTarget(
	target: AliasTarget,
	resolvers: Readonly<Record<string, AliasResolver>>,
	context: ResolverContext | undefined,
): ResolvedTarget | undefined {
	switch (target.kind) {
		case "canonical":
		case "literal":
			return { value: target.value };
		case "number-word":
			return { value: String(target.value) };
		case "fundamental":
			return target.variantId === undefined
				? { value: target.groupId }
				: { value: target.groupId, precision: target.variantId };
		case "extraction":
			return { value: target.extractionId };
		case "resolver": {
			const resolver = resolvers[target.resolverId];
			if (!resolver || !context) return undefined;
			const resolved = resolver(target.params ?? {}, context);
			return {
				value: resolved.value,
				...(resolved.precision === undefined
					? {}
					: { precision: resolved.precision }),
				...(resolved.requiredContext === undefined
					? {}
					: { requiredContext: resolved.requiredContext }),
			};
		}
	}
}

/** Resolves an input against a single namespace using longest-match. Scope is deterministic and limited to the selected namespace; global search is never performed. Returns undefined when no spelling matches. */
export function resolveAlias(
	registry: CompiledAliasRegistry,
	namespace: AliasNamespace,
	input: string,
	context?: ResolverContext,
	resolvers: Readonly<Record<string, AliasResolver>> = {},
): AliasResolution | undefined {
	const entries = registry.namespaces[namespace];
	if (!entries) return undefined;
	for (const entry of entries) {
		if (spellingMatches(input, entry)) {
			const target = resolveTarget(entry.target, resolvers, context);
			if (!target) return undefined;
			return {
				definitionId: entry.definitionId,
				namespace,
				spelling: entry.spelling,
				target,
			};
		}
	}
	return undefined;
}
