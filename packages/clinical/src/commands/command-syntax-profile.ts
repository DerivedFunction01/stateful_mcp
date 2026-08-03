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
}

export const _COMMAND_SYNTAX_DEFAULTS = {
	directCommandToken: ":",
	macroStartToken: "^",
	directCommandMappings: {
		branch: "branch",
		confirm: "confirm",
		rule_out: "rule_out",
		suspend: "suspend",
		re_activate: "re_activate",
		close: "close",
		complete: "complete",
	},
	editorCommandMappings: {
		write: "write",
		w: "write",
		quit: "quit",
		q: "quit",
		write_quit: "write_quit",
		wq: "write_quit",
		help: "help",
		h: "help",
		mode: "mode",
		undo: "undo",
		u: "undo",
		redo: "redo",
		render: "render",
	},
	variableCommandToken: ":",
	variableCommandName: "var",
	variableAssignmentDelimiter: "=",
	variableNamePattern: "^[A-Za-z_][A-Za-z0-9_.]*$",
	variableCommandMappings: {
		set: "set",
		update: "update",
		eval: "eval",
		assert: "assert",
		remove: "remove",
	},
} as const;

export function createCommandSyntaxProfile(
	profile: Partial<CommandSyntaxProfile> &
		Pick<CommandSyntaxProfile, "profileId">,
): CommandSyntaxProfile {
	return {
		...profile,
		directCommandToken:
			profile.directCommandToken ?? _COMMAND_SYNTAX_DEFAULTS.directCommandToken,
		macroStartToken:
			profile.macroStartToken ?? _COMMAND_SYNTAX_DEFAULTS.macroStartToken,
		directCommandMappings: {
			..._COMMAND_SYNTAX_DEFAULTS.directCommandMappings,
			...profile.directCommandMappings,
		},
		editorCommandMappings: {
			..._COMMAND_SYNTAX_DEFAULTS.editorCommandMappings,
			...profile.editorCommandMappings,
		},
		variableCommandToken:
			profile.variableCommandToken ??
			_COMMAND_SYNTAX_DEFAULTS.variableCommandToken,
		variableCommandName:
			profile.variableCommandName ??
			_COMMAND_SYNTAX_DEFAULTS.variableCommandName,
		variableAssignmentDelimiter:
			profile.variableAssignmentDelimiter ??
			_COMMAND_SYNTAX_DEFAULTS.variableAssignmentDelimiter,
		variableNamePattern:
			profile.variableNamePattern ??
			_COMMAND_SYNTAX_DEFAULTS.variableNamePattern,
		variableCommandMappings: {
			..._COMMAND_SYNTAX_DEFAULTS.variableCommandMappings,
			...profile.variableCommandMappings,
		},
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
