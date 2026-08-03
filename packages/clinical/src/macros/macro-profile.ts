import type { V2CommandSyntaxProfile } from "../commands/command-syntax-profile";
import { createV2CommandSyntaxProfile } from "../commands/command-syntax-profile";

export interface V2SyntaxProfile extends Partial<V2CommandSyntaxProfile> {
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
	directCommandToken: ":",
	conceptCodeSeparator: "::",
	macroArgDelimiter: undefined,
	fallbackBoundaryDelimiter: undefined,
} as const;

export function createV2SyntaxProfile(
	profile: Omit<V2SyntaxProfile, "macroStartToken" | "conceptCodeSeparator"> &
		Partial<Pick<V2SyntaxProfile, "macroStartToken" | "conceptCodeSeparator">>,
): V2SyntaxProfile {
	const commandProfile = createV2CommandSyntaxProfile(profile);
	return {
		...profile,
		...commandProfile,
		macroStartToken:
			profile.macroStartToken ?? V2_SYNTAX_DEFAULTS.macroStartToken,
		conceptCodeSeparator:
			profile.conceptCodeSeparator ?? V2_SYNTAX_DEFAULTS.conceptCodeSeparator,
	};
}
