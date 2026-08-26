import type { ConfiguredValueRuntime } from "../values/engine";
import type { ExpressionBackend } from "./backends";
import type { MacroRuntimeContext } from "./context";
import type { MacroArgumentForm, MacroAuthoringTemplate } from "./matching";
import type { NumericBounds, ScalarType, ValueKind } from "./values";

export const MACRO_RUN_MODES = ["live", "execute", "replay"] as const;
export type MacroRunMode = (typeof MACRO_RUN_MODES)[number];

export const MACRO_MATCHING_MODES = ["unordered", "declared"] as const;
export type MacroMatchingMode = (typeof MACRO_MATCHING_MODES)[number];

export const MACRO_OVERLAP_STRATEGIES = ["precedence", "longest"] as const;
export type MacroOverlapStrategy = (typeof MACRO_OVERLAP_STRATEGIES)[number];

export const MACRO_BLANK_POLICIES = ["reject", "allow", "skip"] as const;
export type MacroBlankPolicy = (typeof MACRO_BLANK_POLICIES)[number];

export interface MacroArgumentSpec {
	argumentId: string;
	name: string;
	aliases?: readonly string[];
	position?: number;
	path: string;
	/** Typed values are parsed only through the explicitly supplied recipes. */
	configuredValue?: {
		consumerId: string;
	};
	forms?: readonly MacroArgumentForm[];
	valueKind?: ValueKind;
	scalarType?: ScalarType;
	numericBounds?: NumericBounds;
	required?: boolean;
	repeatable?: boolean;
	itemDelimiter?: string;
	defaultValue?: string;
	blankPolicy?: MacroBlankPolicy;
	normalize?: (
		raw: string,
		captures: Record<string, string | undefined>,
	) => unknown;
	normalizeCanonical?: (
		value: unknown,
		raw: string,
		captures: Record<string, string | undefined>,
	) => unknown;
}

export interface MacroMatchingOptions {
	mode?: MacroMatchingMode;
	positionalFallback?: boolean;
	overlap?: MacroOverlapStrategy;
	subOrder?: readonly string[];
	subOrderGroups?: Readonly<Record<string, readonly string[]>>;
}

export interface MacroSpec {
	id: string;
	name: string;
	version?: number;
	arguments: readonly MacroArgumentSpec[];
	authoringTemplates?: readonly MacroAuthoringTemplate[];
	matching?: MacroMatchingOptions;
	metadata?: Record<string, unknown>;
	backendRequirements?: readonly string[];
}

export interface MacroRegistry {
	get(name: string): MacroSpec | undefined;
	list(): readonly MacroSpec[];
}

export interface MacroParseOptions {
	context: MacroRuntimeContext;
	lineNumber?: number;
	mode?: MacroRunMode;
	backends?: Readonly<Record<string, ExpressionBackend>>;
	candidateSnapshots?: readonly import("./composition").MacroCandidateSnapshot[];
	subOrder?: readonly string[];
	subOrderGroups?: Readonly<Record<string, readonly string[]>>;
	configuredValues?: ConfiguredValueRuntime;
}
