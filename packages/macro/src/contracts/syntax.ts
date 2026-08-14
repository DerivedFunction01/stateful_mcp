export interface MacroSyntax {
	macroStartToken: string;
	argumentDelimiter?: string;
	quoteCharacters?: readonly string[];
	groupOpen?: string;
	groupClose?: string;
}

export const defaultMacroSyntax: MacroSyntax = {
	macroStartToken: "^",
	quoteCharacters: ['"', "'"],
	groupOpen: "[",
	groupClose: "]",
};
