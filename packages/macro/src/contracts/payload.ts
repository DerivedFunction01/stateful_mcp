import type { MacroDiagnostic } from "./input";
import type { MacroRunMode, MacroSpec } from "./macro";
import type { MacroArgumentMatch } from "./matching";

export const MACRO_ARGUMENT_STATES = [
	"pending",
	"locked",
	"unset",
	"invalid",
] as const;
export type ArgumentState = (typeof MACRO_ARGUMENT_STATES)[number];
export type MacroArgumentState = ArgumentState;

export interface MacroArgumentResult {
	argumentId: string;
	name: string;
	path: string;
	state: ArgumentState;
	rawText?: string;
	value?: unknown;
	match?: MacroArgumentMatch;
}

export const MACRO_PARSE_STATUSES = [
	"matched",
	"incomplete",
	"invalid",
] as const;
export type MacroParseStatus = (typeof MACRO_PARSE_STATUSES)[number];

export interface MacroParseResult {
	status: MacroParseStatus;
	macro: { id: string; name: string };
	arguments: MacroArgumentResult[];
	payload: Record<string, unknown>;
	diagnostics: MacroDiagnostic[];
}

export interface PayloadCompileOptions {
	mode?: MacroRunMode;
}

export interface PayloadCompiler {
	compile(
		spec: MacroSpec,
		raw: string,
		options?: PayloadCompileOptions,
	): MacroParseResult;
}
