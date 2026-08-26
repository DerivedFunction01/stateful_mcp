import type {
	ErrorDescriptor,
	MessageParam,
} from "@stateful-mcp/macro-protocol";

/** Typed alias namespaces. Canonical-id is explicit only: its IDs are NOT auto-accepted. */
export type AliasNamespace =
	| "canonical-id"
	| "literal"
	| "resolver"
	| "fundamental"
	| "extraction"
	| "number-word";

export interface AliasNamespaceMeta {
	readonly id: AliasNamespace;
	readonly description: string;
	/** Declarative description of the target shape this namespace resolves to. */
	readonly targetKind: AliasTarget["kind"];
}

export const ALIAS_NAMESPACES: Readonly<
	Record<AliasNamespace, AliasNamespaceMeta>
> = Object.freeze({
	"canonical-id": {
		id: "canonical-id",
		description:
			"Explicit canonical identifier spellings; the canonical id is never auto-accepted.",
		targetKind: "canonical",
	},
	literal: {
		id: "literal",
		description: "Literal string value spelled out explicitly.",
		targetKind: "literal",
	},
	resolver: {
		id: "resolver",
		description:
			"Registered resolver invoked with declarative params and injected runtime context.",
		targetKind: "resolver",
	},
	fundamental: {
		id: "fundamental",
		description: "Fundamental/extraction group reference.",
		targetKind: "fundamental",
	},
	extraction: {
		id: "extraction",
		description: "Standalone extraction reference.",
		targetKind: "extraction",
	},
	"number-word": {
		id: "number-word",
		description: "Number expressed as a word mapping to a numeric value.",
		targetKind: "number-word",
	},
});

export type AliasTargetKind = AliasTarget["kind"];

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

export type AliasBoundary = "none" | "word";

export interface AliasDefinition {
	readonly id: string;
	readonly namespace: AliasNamespace;
	readonly spellings: readonly string[];
	readonly locale?: string | readonly string[];
	readonly caseSensitive?: boolean;
	readonly boundary?: AliasBoundary;
	readonly target: AliasTarget;
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

function aliasesDiagnostic(
	code: string,
	messageKey: string,
	messageParams: Readonly<Record<string, MessageParam>>,
	extra: Pick<AliasDiagnostic, "definitionId" | "namespace" | "spelling"> = {},
): AliasDiagnostic {
	return {
		code,
		messageKey,
		messageParams,
		...extra,
	};
}

function isWordChar(char: string): boolean {
	return /[\p{L}\p{N}]/u.test(char);
}

function spellingMatches(input: string, entry: CompiledAliasEntry): boolean {
	const a = entry.caseSensitive ? input : input.toLowerCase();
	const b = entry.caseSensitive ? entry.spelling : entry.spelling.toLowerCase();
	if (entry.boundary === "none") return a === b;
	let index = a.indexOf(b);
	while (index !== -1) {
		const before = index === 0 ? "" : a[index - 1]!;
		const after = index + b.length >= a.length ? "" : a[index + b.length]!;
		if (
			(before === "" || !isWordChar(before)) &&
			(after === "" || !isWordChar(after))
		) {
			return true;
		}
		index = a.indexOf(b, index + 1);
	}
	return false;
}

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

/**
 * Compiles alias definitions into a per-namespace registry. Validates duplicate
 * IDs, conflicting same-namespace spellings, unknown resolver IDs, and malformed
 * definitions. Diagnostics use canonical ErrorDescriptor fields only.
 */
export function compileAliasRegistry(
	definitions: readonly AliasDefinition[],
	resolvers: Readonly<Record<string, AliasResolver>> = {},
): CompiledAliasRegistry {
	const diagnostics: AliasDiagnostic[] = [];
	const namespaces: Partial<Record<AliasNamespace, CompiledAliasEntry[]>> = {};
	const seenIds = new Set<string>();
	const seenSpellings = new Map<string, string>();

	for (const definition of definitions) {
		if (!definition?.id || typeof definition.id !== "string") {
			diagnostics.push(
				aliasesDiagnostic(
					"ALIAS_INVALID_DEFINITION",
					"aliases.invalidDefinition",
					{
						reason: "missing-id",
					},
				),
			);
			continue;
		}
		if (!definition.namespace || !(definition.namespace in ALIAS_NAMESPACES)) {
			diagnostics.push(
				aliasesDiagnostic(
					"ALIAS_INVALID_DEFINITION",
					"aliases.invalidDefinition",
					{ reason: "invalid-namespace", id: definition.id },
					{ definitionId: definition.id },
				),
			);
			continue;
		}
		if (
			!Array.isArray(definition.spellings) ||
			definition.spellings.length === 0
		) {
			diagnostics.push(
				aliasesDiagnostic(
					"ALIAS_INVALID_DEFINITION",
					"aliases.invalidDefinition",
					{ reason: "missing-spellings", id: definition.id },
					{ definitionId: definition.id, namespace: definition.namespace },
				),
			);
			continue;
		}
		if (seenIds.has(definition.id)) {
			diagnostics.push(
				aliasesDiagnostic(
					"ALIAS_DUPLICATE_ID",
					"aliases.duplicateId",
					{ id: definition.id },
					{ definitionId: definition.id, namespace: definition.namespace },
				),
			);
			continue;
		}
		seenIds.add(definition.id);

		if (definition.target.kind === "resolver") {
			if (!resolvers[definition.target.resolverId]) {
				diagnostics.push(
					aliasesDiagnostic(
						"ALIAS_UNKNOWN_RESOLVER",
						"aliases.unknownResolver",
						{
							id: definition.id,
							resolverId: definition.target.resolverId,
						},
						{ definitionId: definition.id, namespace: definition.namespace },
					),
				);
				continue;
			}
		}

		const caseSensitive = definition.caseSensitive ?? true;
		const boundary = definition.boundary ?? "none";
		const bucket = namespaces[definition.namespace] ?? [];
		namespaces[definition.namespace] = bucket;
		for (const spelling of definition.spellings) {
			const key = `${definition.namespace}:${caseSensitive ? spelling : spelling.toLowerCase()}`;
			const existing = seenSpellings.get(key);
			if (existing !== undefined && existing !== definition.id) {
				diagnostics.push(
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
			} else {
				seenSpellings.set(key, definition.id);
			}
			bucket.push({
				definitionId: definition.id,
				spelling,
				caseSensitive,
				boundary,
				target: definition.target,
			});
		}
	}

	for (const namespace of Object.keys(namespaces) as AliasNamespace[]) {
		const entries = namespaces[namespace]!;
		entries.sort((first, second) => {
			if (second.spelling.length !== first.spelling.length) {
				return second.spelling.length - first.spelling.length;
			}
			if (first.spelling !== second.spelling) {
				return first.spelling < second.spelling ? -1 : 1;
			}
			return first.definitionId < second.definitionId ? -1 : 1;
		});
		namespaces[namespace] = [...Object.freeze(entries)];
	}

	return {
		namespaces: Object.freeze(namespaces),
		diagnostics: Object.freeze(diagnostics),
	};
}

/**
 * Resolves an input against a single namespace using longest-match. Scope is
 * deterministic and limited to the selected namespace; global search is never
 * performed. Returns undefined when no spelling matches.
 */
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
