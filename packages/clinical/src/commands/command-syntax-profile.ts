export type DirectCommandVerb =
	| "branch"
	| "confirm"
	| "rule_out"
	| "suspend"
	| "re_activate"
	| "close"
	| "complete";

export type EditorCommandVerb =
	| "write"
	| "quit"
	| "write_quit"
	| "help"
	| "mode"
	| "undo"
	| "redo"
	| "render";

export type VariableCommandVerb =
	| "set"
	| "update"
	| "eval"
	| "assert"
	| "remove";

export const _DIRECT_COMMANDS: readonly DirectCommandVerb[] = [
	"branch",
	"confirm",
	"rule_out",
	"suspend",
	"re_activate",
	"close",
	"complete",
];

export const _EDITOR_COMMANDS: readonly EditorCommandVerb[] = [
	"write",
	"quit",
	"write_quit",
	"help",
	"mode",
	"undo",
	"redo",
	"render",
];

export interface CommandSyntaxProfile {
	profileId: string;
	personnelId?: string;
	active?: boolean;
	default?: boolean;
	directCommandToken: string;
	macroStartToken: string;
	directCommandMappings: Readonly<Record<string, DirectCommandVerb>>;
	editorCommandMappings: Readonly<Record<string, EditorCommandVerb>>;
	variableCommandToken: string;
	variableCommandName: string;
	variableAssignmentDelimiter: string;
	variableNamePattern: string;
	variableCommandMappings: Readonly<Record<string, VariableCommandVerb>>;
	expressionToken: string;
	conceptToken: string;
	conceptNamespaceSeparator?: string;
}

export interface CommandSyntaxProfileDefaults {
	directCommandToken?: string;
	macroStartToken?: string;
	directCommandMappings?: Readonly<Record<string, DirectCommandVerb>>;
	editorCommandMappings?: Readonly<Record<string, EditorCommandVerb>>;
	variableCommandToken?: string;
	variableCommandName?: string;
	variableAssignmentDelimiter?: string;
	variableNamePattern?: string;
	variableCommandMappings?: Readonly<Record<string, VariableCommandVerb>>;
	expressionToken?: string;
	conceptToken?: string;
	conceptNamespaceSeparator?: string;
}

export function createCommandSyntaxProfile(
	profile: Partial<CommandSyntaxProfile> &
		Pick<CommandSyntaxProfile, "profileId">,
	defaults?: CommandSyntaxProfileDefaults,
): CommandSyntaxProfile {
	return {
		...profile,
		directCommandToken:
			profile.directCommandToken ?? defaults?.directCommandToken ?? "",
		macroStartToken: profile.macroStartToken ?? defaults?.macroStartToken ?? "",
		directCommandMappings:
			profile.directCommandMappings ?? defaults?.directCommandMappings ?? {},
		editorCommandMappings:
			profile.editorCommandMappings ?? defaults?.editorCommandMappings ?? {},
		variableCommandToken:
			profile.variableCommandToken ?? defaults?.variableCommandToken ?? "",
		variableCommandName:
			profile.variableCommandName ?? defaults?.variableCommandName ?? "",
		variableAssignmentDelimiter:
			profile.variableAssignmentDelimiter ??
			defaults?.variableAssignmentDelimiter ??
			"",
		variableNamePattern:
			profile.variableNamePattern ??
			defaults?.variableNamePattern ??
			({} as any),
		variableCommandMappings:
			profile.variableCommandMappings ??
			defaults?.variableCommandMappings ??
			{},
		expressionToken: profile.expressionToken ?? defaults?.expressionToken ?? "",
		conceptToken: profile.conceptToken ?? defaults?.conceptToken ?? "",
		conceptNamespaceSeparator:
			profile.conceptNamespaceSeparator ??
			defaults?.conceptNamespaceSeparator ??
			"",
	};
}

export function resolveCommandSyntaxProfile(
	profiles: readonly CommandSyntaxProfile[] = [],
	personnelId?: string,
): CommandSyntaxProfile {
	return (
		profiles.find(
			(profile) => profile.active && profile.personnelId === personnelId,
		) ??
		profiles.find((profile) => profile.active && profile.default) ??
		profiles.find((profile) => profile.default) ??
		profiles[0] ??
		createCommandSyntaxProfile({
			profileId: "v2-default",
			default: true,
			active: true,
		})
	);
}
