export interface V2SyntaxProfile {
	profileId: string;
	personnelId?: string;
	isDefault?: boolean;
	isActive?: boolean;
	macroStartToken: string;
	macroArgStartToken?: string;
	macroArgEndToken?: string;
	macroArgDelimiter?: string;
	fallbackBoundaryDelimiter?: string;
	conceptCodeSeparator: string;
	fieldMappings?: Readonly<Record<string, string>>;
	conceptNamespaces?: Readonly<Record<string, readonly string[]>>;
}

export const V2_SYNTAX_DEFAULTS = {
	macroStartToken: "^",
	variableStartToken: "{",
	variableEndToken: "}",
	cellCommandToken: ":",
	conceptCodeSeparator: "::",
	macroArgDelimiter: undefined,
	fallbackBoundaryDelimiter: undefined,
} as const;

export function createV2SyntaxProfile(
	profile: Omit<V2SyntaxProfile, "macroStartToken" | "conceptCodeSeparator"> &
		Partial<Pick<V2SyntaxProfile, "macroStartToken" | "conceptCodeSeparator">>,
): V2SyntaxProfile {
	return {
		...profile,
		macroStartToken: profile.macroStartToken ?? V2_SYNTAX_DEFAULTS.macroStartToken,
		conceptCodeSeparator: profile.conceptCodeSeparator ?? V2_SYNTAX_DEFAULTS.conceptCodeSeparator,
	};
}
