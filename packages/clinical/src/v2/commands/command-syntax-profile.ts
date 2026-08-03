export type V2DirectCommandVerb =
	| "branch"
	| "confirm"
	| "rule_out"
	| "suspend"
	| "re_activate"
	| "close"
	| "complete";

export type V2EditorCommandVerb =
	| "write"
	| "quit"
	| "write_quit"
	| "help"
	| "mode"
	| "undo"
	| "redo"
	| "render";

export type V2VariableCommandVerb = "set" | "update" | "eval" | "assert" | "remove";

export const V2_DIRECT_COMMANDS: readonly V2DirectCommandVerb[] = [
	"branch", "confirm", "rule_out", "suspend", "re_activate", "close", "complete",
];

export const V2_EDITOR_COMMANDS: readonly V2EditorCommandVerb[] = [
	"write", "quit", "write_quit", "help", "mode", "undo", "redo", "render",
];

export interface V2CommandSyntaxProfile {
	profileId: string;
	personnelId?: string;
	active?: boolean;
	default?: boolean;
	directCommandToken: string;
	macroStartToken: string;
	directCommandMappings: Readonly<Record<string, V2DirectCommandVerb>>;
	editorCommandMappings: Readonly<Record<string, V2EditorCommandVerb>>;
	variableCommandToken: string;
	variableCommandName: string;
	variableAssignmentDelimiter: string;
	variableNamePattern: string;
	variableCommandMappings: Readonly<Record<string, V2VariableCommandVerb>>;
}

export const V2_COMMAND_SYNTAX_DEFAULTS = {
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

export function createV2CommandSyntaxProfile(
	profile: Partial<V2CommandSyntaxProfile> & Pick<V2CommandSyntaxProfile, "profileId">,
): V2CommandSyntaxProfile {
	return {
		...profile,
		directCommandToken: profile.directCommandToken ?? V2_COMMAND_SYNTAX_DEFAULTS.directCommandToken,
		macroStartToken: profile.macroStartToken ?? V2_COMMAND_SYNTAX_DEFAULTS.macroStartToken,
		directCommandMappings: { ...V2_COMMAND_SYNTAX_DEFAULTS.directCommandMappings, ...profile.directCommandMappings },
		editorCommandMappings: { ...V2_COMMAND_SYNTAX_DEFAULTS.editorCommandMappings, ...profile.editorCommandMappings },
		variableCommandToken: profile.variableCommandToken ?? V2_COMMAND_SYNTAX_DEFAULTS.variableCommandToken,
		variableCommandName: profile.variableCommandName ?? V2_COMMAND_SYNTAX_DEFAULTS.variableCommandName,
		variableAssignmentDelimiter: profile.variableAssignmentDelimiter ?? V2_COMMAND_SYNTAX_DEFAULTS.variableAssignmentDelimiter,
		variableNamePattern: profile.variableNamePattern ?? V2_COMMAND_SYNTAX_DEFAULTS.variableNamePattern,
		variableCommandMappings: { ...V2_COMMAND_SYNTAX_DEFAULTS.variableCommandMappings, ...profile.variableCommandMappings },
	};
}

export function resolveV2CommandSyntaxProfile(
	profiles: readonly V2CommandSyntaxProfile[] = [],
	personnelId?: string,
): V2CommandSyntaxProfile {
	return profiles.find((profile) => profile.active && profile.personnelId === personnelId)
		?? profiles.find((profile) => profile.active && profile.default)
		?? profiles.find((profile) => profile.default)
		?? profiles[0]
		?? createV2CommandSyntaxProfile({ profileId: "v2-default", default: true, active: true });
}
