import type {
	CompiledDomainGrammar,
	UserMacroProfile,
} from "../contracts/extension-config";
import { compileDomainConfig } from "../extensions/config";

/**
 * The declarative value graph persisted by a profile or extension. Runtime
 * code compiles this data; it never supplies domain templates of its own.
 */
export type AuthoredValueGraph = Pick<
	UserMacroProfile,
	| "fundamentals"
	| "aliases"
	| "aliasResolvers"
	| "recipes"
	| "values"
	| "unitAliases"
	| "localization"
	| "numberWords"
>;

export interface AuthoredValueGraphCompilation {
	readonly grammar: CompiledDomainGrammar;
	readonly valid: boolean;
	readonly diagnostics: CompiledDomainGrammar["diagnostics"];
}

/**
 * Compiles only user-authored graph data. Empty graph data remains empty at
 * the recognition layer because recipes must be explicitly enabled by the
 * consuming argument.
 */
export function compileAuthoredValueGraph(
	graph: AuthoredValueGraph,
): AuthoredValueGraphCompilation {
	const grammar = compileDomainConfig(graph);
	return {
		grammar,
		valid: grammar.valid && (grammar.recipes?.recipes.length ?? 0) > 0,
		diagnostics: grammar.diagnostics,
	};
}
