import type { CommandSyntaxProfile } from "../commands/command-syntax-profile";
import { createCommandSyntaxProfile } from "../commands/command-syntax-profile";

export interface SyntaxProfile extends Partial<CommandSyntaxProfile> {
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

export const _SYNTAX_DEFAULTS = {
	macroStartToken: "^",
	variableStartToken: "{",
	variableEndToken: "}",
	directCommandToken: ":",
	conceptCodeSeparator: "::",
	macroArgDelimiter: undefined,
	fallbackBoundaryDelimiter: undefined,
} as const;

export function createSyntaxProfile(
	profile: Omit<SyntaxProfile, "macroStartToken" | "conceptCodeSeparator"> &
		Partial<Pick<SyntaxProfile, "macroStartToken" | "conceptCodeSeparator">>,
): SyntaxProfile {
	const commandProfile = createCommandSyntaxProfile(profile);
	return {
		...profile,
		...commandProfile,
		macroStartToken:
			profile.macroStartToken ?? _SYNTAX_DEFAULTS.macroStartToken,
		conceptCodeSeparator:
			profile.conceptCodeSeparator ?? _SYNTAX_DEFAULTS.conceptCodeSeparator,
	};
}
