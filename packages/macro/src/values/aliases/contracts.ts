import type { ErrorDescriptor } from "@stateful-mcp/macro-protocol";

export type AliasNamespace =
	| "canonical-id"
	| "literal"
	| "resolver"
	| "fundamental"
	| "extraction"
	| "number-word";

export type AliasTarget =
	| { readonly kind: "canonical"; readonly value: string }
	| { readonly kind: "literal"; readonly value: string }
	| {
			readonly kind: "resolver";
			readonly resolverId: string;
			readonly params?: Readonly<Record<string, string>>;
	  }
	| {
			readonly kind: "fundamental";
			readonly groupId: string;
			readonly variantId?: string;
	  }
	| { readonly kind: "extraction"; readonly extractionId: string }
	| { readonly kind: "number-word"; readonly value: number };

export type AliasTargetKind = AliasTarget["kind"];
export type AliasBoundary = "none" | "word";

export interface AliasNamespaceMeta {
	readonly id: AliasNamespace;
	readonly description: string;
	/** Declarative description of the target shape this namespace resolves to. */
	readonly targetKind: AliasTarget["kind"];
}

export interface AliasDefinition {
	readonly id: string;
	readonly namespace: AliasNamespace;
	readonly spellings: readonly string[];
	readonly locale?: string | readonly string[];
	readonly caseSensitive?: boolean;
	readonly boundary?: AliasBoundary;
	readonly target: AliasTarget;
	readonly lexiconId?: string;
}

/** Explicit runtime context handed to registered resolvers. */
export interface ResolverContext {
	readonly nowUtc: Date;
	readonly timezone: string;
	readonly locale: string;
	readonly calendar: string;
}

/** Typed target returned by a resolver, including optional precision/required context. */
export interface ResolvedTarget {
	readonly value: string;
	readonly precision?: string;
	readonly requiredContext?: readonly string[];
}

/** Registered resolver: declarative params plus explicit context, no persisted functions. */
export type AliasResolver = (
	params: Readonly<Record<string, string>>,
	context: ResolverContext,
) => ResolvedTarget;

export interface AliasDiagnostic extends ErrorDescriptor {
	readonly code?: string;
	readonly definitionId?: string;
	readonly namespace?: AliasNamespace;
	readonly spelling?: string;
}

export interface CompiledAliasEntry {
	readonly definitionId: string;
	readonly spelling: string;
	readonly caseSensitive: boolean;
	readonly boundary: AliasBoundary;
	readonly target: AliasTarget;
}

export interface CompiledAliasRegistry {
	readonly namespaces: Readonly<
		Partial<Record<AliasNamespace, readonly CompiledAliasEntry[]>>
	>;
	readonly diagnostics: readonly AliasDiagnostic[];
}

export interface AliasResolution {
	readonly definitionId: string;
	readonly namespace: AliasNamespace;
	readonly spelling: string;
	readonly target: ResolvedTarget;
}
