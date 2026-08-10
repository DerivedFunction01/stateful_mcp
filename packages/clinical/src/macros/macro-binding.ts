/**
 *  macro input and binding contracts.
 *
 * `MacroInput` is the typed result of classifying macro syntax (lines of the
 * form `^macroName arg=value ...`). Binding maps that raw input onto a resolved
 * macro definition's arguments without constructing `ParsedItem`.
 */

export interface MacroSourceLine {
	line: number;
	raw: string;
	macroName?: string;
}

export type MacroArgumentSource =
	| "named"
	| "positional"
	| "inferred"
	| "rule"
	| "friendly"
	| "accepted"
	| "default";

export interface MacroArgumentInput {
	name?: string;
	position?: number;
	rawValue: string;
	captures?: Record<string, string | undefined>;
	items?: MacroListItemInput[];
	source: MacroArgumentSource;
	line?: number;
	start?: number;
	end?: number;
	match?: MacroArgumentMatch;
}

export interface MacroSpan {
	start: number;
	end: number;
}

export interface MacroCaptureSpan extends MacroSpan {
	name: string;
	value?: string;
}

/** A successful definition-driven match that is eligible for UI projection. */
export interface MacroArgumentMatch {
	argumentId: string;
	occurrence?: number;
	formId?: string;
	source: MacroArgumentSource;
	anchor?: MacroSpan;
	extraction: MacroSpan;
	friendlyText?: string;
	rawValue: string;
	captures?: Record<string, string | undefined>;
	captureSpans?: MacroCaptureSpan[];
}

export interface MacroListItemInput {
	rawValue: string;
	start: number;
	end: number;
}

/** Classified macro intent from raw authored text (pre-binding). */
export interface MacroInput {
	macroName: string;
	sourceLines: MacroSourceLine[];
	arguments: MacroArgumentInput[];
	body?: { start: number; end: number; raw: string };
	/** Successful matches only; failed extraction candidates are not projections. */
	matches?: MacroArgumentMatch[];
}

export type MacroBindingErrorCode =
	| "UNKNOWN_ARGUMENT"
	| "MISSING_REQUIRED"
	| "DUPLICATE_ARGUMENT"
	| "AMBIGUOUS_POSITIONAL"
	| "EMPTY_VALUE";

export interface MacroBindingIssue {
	code: MacroBindingErrorCode;
	argumentId?: string;
	message: string;
	start?: number;
	end?: number;
}

export interface MacroArgumentBinding {
	argumentId: string;
	name: string;
	rawValue: string;
	captures?: Record<string, string | undefined>;
	items?: MacroListItemInput[];
	source: MacroArgumentSource;
	start?: number;
	end?: number;
	match?: MacroArgumentMatch;
}

/** A finalized argument binding carried by a committed Macro snapshot. */
export type MacroBinding = MacroArgumentBinding;

export interface MacroBindingResult {
	input: MacroInput;
	definitionRef?: {
		macroId: string;
		macroName: string;
		version: number;
	};
	bindings: MacroArgumentBinding[];
	issues: MacroBindingIssue[];
}
