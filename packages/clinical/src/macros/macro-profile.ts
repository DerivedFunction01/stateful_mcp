import type { CommandSyntaxProfile } from "../commands/command-syntax-profile";
import {
	type CommandSyntaxProfileDefaults,
	createCommandSyntaxProfile,
} from "../commands/command-syntax-profile";

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

export function createSyntaxProfile(
	profile: Omit<SyntaxProfile, "macroStartToken" | "conceptCodeSeparator"> &
		Partial<Pick<SyntaxProfile, "macroStartToken" | "conceptCodeSeparator">>,
	defaults?: CommandSyntaxProfileDefaults,
): SyntaxProfile {
	const commandProfile = createCommandSyntaxProfile(profile, defaults);
	return {
		...profile,
		...commandProfile,
		macroStartToken: commandProfile.macroStartToken,
		conceptCodeSeparator: profile.conceptCodeSeparator ?? "::",
	};
}
