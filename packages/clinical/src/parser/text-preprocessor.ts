import type { ParserSyntaxProfile } from "../store/interfaces";

/**
 * Legacy CDSL text pre-processing (inline variable blocks and macro expansion)
 * is disabled in Engine V2. It remains as a no-op compatibility shim so
 * transitional callers compile while the legacy prose/CDSL path is dismantled.
 * Typed command macros and command variables (`:var`) are handled separately.
 */
export class TextPreprocessor {
	constructor(private profile: ParserSyntaxProfile) {}

	/** Legacy CDSL macro expansion is disabled in Engine V2. */
	async expandMacros(text: string): Promise<string> {
		return text;
	}

	/** Legacy CDSL variable preprocessing is disabled in Engine V2. */
	async applyVariables(text: string): Promise<string> {
		return text;
	}

	async preprocess(text: string): Promise<string> {
		return text;
	}
}
