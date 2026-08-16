import type { MacroSyntax } from "./syntax";

export interface MacroRuntimeContext {
	readonly syntax: MacroSyntax;
}

export function createMacroRuntimeContext(
	syntax?: Partial<MacroSyntax>,
): MacroRuntimeContext {
	const startToken = syntax?.macroStartToken ?? "^";
	const delimiter =
		syntax?.argumentDelimiter ??
		syntax?.macroArgDelimiter ??
		syntax?.fallbackBoundaryDelimiter;

	const resolvedSyntax: MacroSyntax = {
		macroStartToken: startToken,
		...(delimiter !== undefined ? { argumentDelimiter: delimiter } : {}),
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
