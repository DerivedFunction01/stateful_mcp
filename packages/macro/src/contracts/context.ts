import type { MacroSyntax } from "./syntax";

export interface MacroRuntimeContext {
	readonly syntax: MacroSyntax;
}

export function createMacroRuntimeContext(
	syntax?: Partial<MacroSyntax>,
): MacroRuntimeContext {
	const startToken = syntax?.macroStartToken ?? "";

	const resolvedSyntax: MacroSyntax = {
		macroStartToken: startToken,
		...(syntax?.argumentDelimiter !== undefined
			? { argumentDelimiter: syntax.argumentDelimiter }
			: {}),
		...(syntax?.settingsListDelimiter !== undefined
			? { settingsListDelimiter: syntax.settingsListDelimiter }
			: {}),
		...(syntax?.quoteCharacters
			? { quoteCharacters: syntax.quoteCharacters }
			: {}),
		...(syntax?.groupOpen ? { groupOpen: syntax.groupOpen } : {}),
		...(syntax?.groupClose ? { groupClose: syntax.groupClose } : {}),
		...(syntax?.expressionToken
			? { expressionToken: syntax.expressionToken }
			: {}),
		...(syntax?.conceptToken ? { conceptToken: syntax.conceptToken } : {}),
		...(syntax?.conceptCodeSeparator
			? { conceptCodeSeparator: syntax.conceptCodeSeparator }
			: {}),
	};

	return {
		syntax: resolvedSyntax,
	};
}
