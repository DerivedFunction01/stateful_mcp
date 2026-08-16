export interface MacroSyntax {
	macroStartToken: string;
	argumentDelimiter?: string;
	quoteCharacters?: readonly string[];
	quotePairs?: readonly (readonly [open: string, close: string])[];
	groupOpen?: string;
	groupClose?: string;
	groupPairs?: readonly (readonly [open: string, close: string])[];
	expressionToken?: string;
	conceptToken?: string;
	conceptCodeSeparator?: string;
}

export function resolveArgumentDelimiter(
	syntax?: Partial<MacroSyntax>,
): string | undefined {
	return syntax?.argumentDelimiter;
}
