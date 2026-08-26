import type { ErrorDescriptor } from "@stateful-mcp/macro-protocol";
import type {
	CompiledArgumentPolicy,
	CompiledDomainGrammar,
} from "../../contracts/extension-config";
import type { CompiledFundamentalVariant } from "../fundamentals";

export type RecipeNode =
	| {
			readonly kind: "fundamental";
			readonly groupId: string;
			readonly variantIds?: readonly string[];
			readonly children: readonly RecipeNode[];
	  }
	| { readonly kind: "terminal"; readonly consumerId: string };

export interface RecipeReferenceNode {
	readonly kind: "recipe";
	readonly recipeId: string;
}

export type RecipeNodeWithReferences = RecipeNode | RecipeReferenceNode;

export interface ValueRecipe {
	readonly id: string;
	readonly root: RecipeNodeWithReferences;
	readonly priority?: number;
	/** Registered executable builder for the value produced by a structured root. */
	readonly outputBuilderId?: string;
}

export interface ConsumerRecipePolicy {
	readonly enabledRecipes: readonly string[];
	readonly priorityOverrides?: Readonly<Record<string, number>>;
}

export interface RecipeDiagnostic extends ErrorDescriptor {
	readonly errorCode?: string;
	readonly recipeId?: string;
	readonly groupId?: string;
	readonly variantId?: string;
}

export interface CompiledRecipe {
	readonly id: string;
	readonly priority?: number;
	readonly outputBuilderId?: string;
	readonly root: CompiledRecipeNode;
}

export type CompiledRecipeNode =
	| {
			readonly kind: "fundamental";
			readonly groupId: string;
			readonly variants: readonly CompiledFundamentalVariant[];
			readonly children: readonly CompiledRecipeNode[];
	  }
	| { readonly kind: "terminal"; readonly consumerId: string };

export interface RecipeCompileResult {
	readonly recipes: readonly CompiledRecipe[];
	readonly diagnostics: readonly RecipeDiagnostic[];
}

export interface RecipeCompileOptions {
	/** Registered terminal IDs available to the compiled runtime. */
	readonly terminalIds?: ReadonlySet<string>;
	readonly outputBuilderIds?: ReadonlySet<string>;
}

export interface RecipeCandidate {
	readonly recipeId: string;
	readonly variantPath: readonly string[];
	readonly priority: number;
	readonly explicitPriority: boolean;
	readonly captures: Readonly<Record<string, string>>;
	readonly captureSpans: Readonly<
		Record<string, { start: number; end: number }>
	>;
	readonly evaluation: RecipeEvaluation;
	readonly canonicalValue?: unknown;
	readonly displayValue?: string;
	readonly diagnostics: readonly RecipeDiagnostic[];
}

export interface RecipeParseResult {
	readonly candidates: readonly RecipeCandidate[];
	readonly selected?: RecipeCandidate;
	readonly ambiguous: boolean;
	readonly diagnostics: readonly RecipeDiagnostic[];
}

export interface TerminalParseRequest {
	readonly consumerId: string;
	readonly input: string;
	readonly recipeId?: string;
	readonly slotId?: string;
	readonly grammar?: CompiledDomainGrammar;
	readonly policy?: Partial<CompiledArgumentPolicy>;
	readonly context?: Readonly<Record<string, unknown>>;
}

export interface TerminalParseResult {
	readonly valid: boolean;
	readonly value?: unknown;
	readonly canonicalValue?: unknown;
	readonly displayValue?: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
	readonly diagnostics?: readonly RecipeDiagnostic[];
	readonly stable?: boolean;
}

/** The third request argument is optional so existing terminal functions can be migrated independently without changing the recipe evaluator again. */
export type TerminalParser = (
	consumerId: string,
	input: string,
	request?: TerminalParseRequest,
) => TerminalParseResult;

export type AsyncTerminalParser = (
	consumerId: string,
	input: string,
	request?: TerminalParseRequest,
) => TerminalParseResult | Promise<TerminalParseResult>;

export type RecipeEvaluation =
	| {
			readonly kind: "terminal";
			readonly consumerId: string;
			readonly input: string;
			readonly value?: unknown;
			readonly displayValue?: string;
			readonly metadata?: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly kind: "fundamental";
			readonly groupId: string;
			readonly variantId: string;
			readonly slots: Readonly<Record<string, RecipeEvaluation>>;
			readonly captures: Readonly<Record<string, string>>;
			readonly captureSpans: Readonly<
				Record<string, { start: number; end: number }>
			>;
	  };

export interface RecipeOutputBuilderContext {
	readonly recipeId: string;
	readonly input: string;
	readonly evaluation: RecipeEvaluation;
	readonly captures: Readonly<Record<string, string>>;
	readonly grammar?: CompiledDomainGrammar;
	readonly policy?: Partial<CompiledArgumentPolicy>;
	readonly context?: Readonly<Record<string, unknown>>;
}

export interface RecipeOutputBuilderResult {
	readonly valid: boolean;
	readonly value?: unknown;
	readonly displayValue?: string;
	readonly diagnostics?: readonly RecipeDiagnostic[];
}

export type RecipeOutputBuilder = (
	context: RecipeOutputBuilderContext,
) => RecipeOutputBuilderResult;
