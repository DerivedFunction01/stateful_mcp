import type { MacroArgumentMatch } from "./matching";

export interface MacroSpan {
	start: number;
	end: number;
}

export interface MacroCaptureSpan extends MacroSpan {
	name: string;
	value?: string;
}

export interface ParsedTextValue {
	sourceText: string;
	valueText: string;
	sourceSpan: MacroSpan;
	valueSpan: MacroSpan;
}

export interface MacroListItemInput {
	rawValue: string;
	start: number;
	end: number;
}

export type MacroArgumentSource =
	| "named"
	| "positional"
	| "inferred"
	| "friendly"
	| "expression"
	| "accepted"
	| "default";

export interface MacroSourceLine {
	line: number;
	raw: string;
	macroName?: string;
}

export interface MacroArgumentInput {
	name?: string;
	position?: number;
	rawValue: string;
	captures?: Record<string, string | undefined>;
	source: MacroArgumentSource;
	line?: number;
	start?: number;
	end?: number;
	sourceSpan?: MacroSpan;
	valueSpan?: MacroSpan;
	sourceText?: string;
	valueText?: string;
	items?: MacroListItemInput[];
	match?: MacroArgumentMatch;
}

export interface MacroInput {
	macroName: string;
	sourceLines: MacroSourceLine[];
	arguments: MacroArgumentInput[];
	body?: MacroSpan & { raw: string };
	matches: MacroArgumentMatch[];
	candidates?: MacroArgumentMatch[];
	candidateMatches?: MacroArgumentMatch[];
}

export type MacroDiagnosticCode =
	| "UNTERMINATED_QUOTE"
	| "UNTERMINATED_GROUP"
	| "INVALID_PATTERN"
	| "UNKNOWN_ARGUMENT"
	| "DUPLICATE_ARGUMENT"
	| "MISSING_REQUIRED"
	| "AMBIGUOUS_MATCH"
	| "NO_MATCH"
	| "INVALID_PATH"
	| "PATH_CONFLICT"
	| "NORMALIZATION_FAILED"
	| "BACKEND_MISSING";

export interface MacroDiagnostic {
	code: MacroDiagnosticCode;
	message: string;
	start?: number;
	end?: number;
	argumentId?: string;
	formId?: string;
}
