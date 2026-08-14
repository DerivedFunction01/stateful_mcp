export interface MacroSyntax {
	macroStartToken: string;
	argumentDelimiter?: string;
	quoteCharacters?: readonly string[];
	groupOpen?: string;
	groupClose?: string;
}
