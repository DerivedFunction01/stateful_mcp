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
