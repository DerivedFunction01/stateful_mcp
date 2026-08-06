export const CANONICAL_COMMAND_VERBS = {
	direct: [
		"branch",
		"confirm",
		"rule_out",
		"suspend",
		"re_activate",
		"close",
		"complete",
		"elevate",
	],
	editor: [
		"write",
		"quit",
		"write_quit",
		"help",
		"mode",
		"undo",
		"redo",
		"render",
	],
	variable: ["set", "update", "eval", "assert", "remove"],
} as const;

export const _DIRECT_COMMANDS = CANONICAL_COMMAND_VERBS.direct;
export type DirectCommandVerb = (typeof CANONICAL_COMMAND_VERBS.direct)[number];

export const _EDITOR_COMMANDS = CANONICAL_COMMAND_VERBS.editor;
export type EditorCommandVerb = (typeof CANONICAL_COMMAND_VERBS.editor)[number];

export const _VARIABLE_COMMANDS = CANONICAL_COMMAND_VERBS.variable;
export type VariableCommandVerb =
	(typeof CANONICAL_COMMAND_VERBS.variable)[number];

export const BRANCH_STATUSES = [
	"active",
	"suspended",
	"confirmed",
	"ruled_out",
	"closed",
] as const;

export type BranchStatus = (typeof BRANCH_STATUSES)[number];
export type BranchTransitionKind =
	| "rule_out"
	| "confirm"
	| "suspend"
	| "reactivate";

export const DIRECT_VERB_TO_BRANCH_STATUS: Readonly<
	Partial<Record<DirectCommandVerb, BranchStatus>>
> = {
	branch: "active",
	confirm: "confirmed",
	rule_out: "ruled_out",
	suspend: "suspended",
	re_activate: "active",
	close: "closed",
};

export const BRANCH_STATUS_TO_TRANSITION: Readonly<
	Record<BranchStatus, BranchTransitionKind | null>
> = {
	ruled_out: "rule_out",
	confirmed: "confirm",
	suspended: "suspend",
	active: "reactivate",
	closed: null,
};

export interface EvidenceSyntaxConfig {
	supportingTokens?: readonly string[];
	refutingTokens?: readonly string[];
	listDelimiters?: readonly string[];
}

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
	conceptCodeSeparator?: string;
	evidenceSyntax?: EvidenceSyntaxConfig;
	actionMacroMappings?: Readonly<Partial<Record<DirectCommandVerb, string>>>;
	implicitDefaultVerb?: DirectCommandVerb;
}

export type CommandAliasMappings<V extends string> = Readonly<
	Partial<Record<V | string, string | readonly string[]>>
>;

export interface CommandSyntaxProfileDefaults {
	directCommandToken?: string;
	macroStartToken?: string;
	directCommandMappings?: CommandAliasMappings<DirectCommandVerb>;
	editorCommandMappings?: CommandAliasMappings<EditorCommandVerb>;
	variableCommandToken?: string;
	variableCommandName?: string;
	variableAssignmentDelimiter?: string;
	variableNamePattern?: string;
	variableCommandMappings?: CommandAliasMappings<VariableCommandVerb>;
	expressionToken?: string;
	conceptToken?: string;
	conceptCodeSeparator?: string;
	evidenceSyntax?: EvidenceSyntaxConfig;
}

function expandMappings<V extends string>(
	mappings?: CommandAliasMappings<V>,
): Record<string, V> {
	if (!mappings) return {};
	const result: Record<string, V> = {};
	for (const [key, value] of Object.entries(mappings)) {
		if (Array.isArray(value)) {
			// Key is canonical verb, value is array of aliases (including or excluding key)
			result[key.toLowerCase()] = key as V;
			for (const alias of value) {
				result[alias.toLowerCase()] = key as V;
			}
		} else if (typeof value === "string") {
			// Key is alias or canonical verb, value is canonical verb
			result[key.toLowerCase()] = value as V;
			result[value.toLowerCase()] = value as V;
		}
	}
	return result;
}

export function createCommandSyntaxProfile(
	profile: Partial<CommandSyntaxProfile> &
		Pick<CommandSyntaxProfile, "profileId">,
	defaults?: CommandSyntaxProfileDefaults,
): CommandSyntaxProfile {
	const directMappings = {
		...expandMappings(defaults?.directCommandMappings),
		...expandMappings(profile.directCommandMappings),
	};
	const editorMappings = {
		...expandMappings(defaults?.editorCommandMappings),
		...expandMappings(profile.editorCommandMappings),
	};
	const variableMappings = {
		...expandMappings(defaults?.variableCommandMappings),
		...expandMappings(profile.variableCommandMappings),
	};

	return {
		...profile,
		directCommandToken:
			profile.directCommandToken ?? defaults?.directCommandToken ?? "",
		macroStartToken: profile.macroStartToken ?? defaults?.macroStartToken ?? "",
		directCommandMappings: directMappings as Record<string, DirectCommandVerb>,
		editorCommandMappings: editorMappings as Record<string, EditorCommandVerb>,
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
		variableCommandMappings: variableMappings as Record<
			string,
			VariableCommandVerb
		>,
		expressionToken: profile.expressionToken ?? defaults?.expressionToken ?? "",
		conceptToken: profile.conceptToken ?? defaults?.conceptToken ?? "",
		conceptCodeSeparator:
			profile.conceptCodeSeparator ?? defaults?.conceptCodeSeparator ?? "",
		evidenceSyntax: profile.evidenceSyntax ??
			defaults?.evidenceSyntax ?? {
				supportingTokens: ["+", "++", "with", "s/b"],
				refutingTokens: ["-", "--", "w/o", "without"],
				listDelimiters: [",", ";", "&"],
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
