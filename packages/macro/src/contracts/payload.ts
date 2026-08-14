import type { MacroDiagnostic } from "./input";
import type { MacroSpec } from "./macro";
import type { MacroArgumentMatch } from "./matching";

export type ArgumentState = "pending" | "locked" | "unset" | "invalid";

export interface MacroArgumentResult {
	argumentId: string;
	name: string;
	path: string;
	state: ArgumentState;
	rawText?: string;
	value?: unknown;
	match?: MacroArgumentMatch;
}

export interface MacroParseResult {
	status: "matched" | "incomplete" | "invalid";
	macro: { id: string; name: string };
	arguments: MacroArgumentResult[];
	payload: Record<string, unknown>;
	diagnostics: MacroDiagnostic[];
}

export interface PayloadCompileOptions {
	mode?: "live" | "execute";
}

export interface PayloadCompiler {
	compile(
		spec: MacroSpec,
		raw: string,
		options?: PayloadCompileOptions,
	): MacroParseResult;
}
