export interface MacroSyntax {
	macroStartToken: string;
	argumentDelimiter?: string;
	macroArgDelimiter?: string;
	fallbackBoundaryDelimiter?: string;
	quoteCharacters?: readonly string[];
	groupOpen?: string;
	groupClose?: string;
	expressionToken?: string;
	conceptToken?: string;
	conceptCodeSeparator?: string;
}

export function resolveArgumentDelimiter(
	syntax?: Partial<MacroSyntax> | {
		readonly argumentDelimiter?: string;
		readonly macroArgDelimiter?: string;
		readonly fallbackBoundaryDelimiter?: string;
	},
): string | undefined {
	return (
		syntax?.argumentDelimiter ??
		syntax?.macroArgDelimiter ??
		syntax?.fallbackBoundaryDelimiter
	);
}
