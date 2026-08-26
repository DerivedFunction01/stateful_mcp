import type {
	CompiledArgumentPolicy,
	CompiledDomainGrammar,
} from "../../contracts/extension-config";
import type {
	AsyncTerminalParser,
	RecipeCandidate,
	RecipeOutputBuilder,
	RecipeParseResult,
	TerminalParser,
} from "../recipes";

export interface ValueEngineOptions {
	readonly terminals: Readonly<Record<string, TerminalParser>>;
	readonly outputBuilders?: Readonly<Record<string, RecipeOutputBuilder>>;
	readonly context?: Readonly<Record<string, unknown>>;
	readonly terminalPolicy?: Partial<CompiledArgumentPolicy>;
	readonly allowedConsumerId?: string;
}

export interface AsyncValueEngineOptions
	extends Omit<ValueEngineOptions, "terminals"> {
	readonly terminals: Readonly<Record<string, AsyncTerminalParser>>;
}

export interface ConfiguredValueRuntime extends ValueEngineOptions {
	readonly grammar: CompiledDomainGrammar;
	readonly policies?: Readonly<Record<string, CompiledArgumentPolicy>>;
	readonly context?: Readonly<Record<string, unknown>>;
	/** Changes whenever the compiled profile/runtime artifact is replaced. */
	readonly fingerprint?: string;
}

export interface ConfiguredValueMatch {
	readonly candidate: RecipeCandidate;
	readonly start: number;
	readonly end: number;
	readonly rawText: string;
}

export type { RecipeParseResult };
