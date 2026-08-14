import type { MacroParseResult } from "./payload";

export interface ParseListenerContext {
	history?: readonly MacroParseResult[];
}

export interface ParseListenerOutput {
	text?: string;
	json?: unknown;
	diagnostics?: string[];
}

export interface ParseListener {
	id: string;
	when?: (result: MacroParseResult) => boolean;
	onParsed: (
		result: MacroParseResult,
		context: ParseListenerContext,
	) => ParseListenerOutput | undefined;
}
