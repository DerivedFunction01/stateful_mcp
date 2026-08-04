import type { CommandSyntaxProfile } from "@stateful-mcp/clinical/commands/command-syntax-profile";
import type { CommandDescriptor } from "./command-descriptor";

export interface BuildCommandDescriptorsOptions {
	/** Variable command name (e.g. "var") from the profile. */
	variableName?: string;
	/** Variable command aliases (e.g. ["variable"]). */
	variableAliases?: string[];
	/** Macro names for MACRO mode suggestions. */
	macroNames?: string[];
}

/**
 * Build canonical `CommandDescriptor[]` from a V2 syntax profile.
 *
 * Mirrors V1's descriptor model: each descriptor has a canonical `verb` plus
 * `aliases: string[]`. The profile stores alias→canonical maps (e.g.
 * `w: "write"`), so we group by the canonical action value and collect the
 * alias keys. This is the single source of truth for the autocomplete bar —
 * custom/bootstrap profiles that add verbs are automatically recognized.
 */
export function buildCommandDescriptors(
	profile: CommandSyntaxProfile,
	options: BuildCommandDescriptorsOptions = {},
): CommandDescriptor[] {
	const descriptors: CommandDescriptor[] = [];

	// Editor commands: group by canonical action value.
	const editorGroups = groupMappingsByCanonical(profile.editorCommandMappings);
	for (const [canonical, aliases] of editorGroups) {
		descriptors.push({
			verb: canonical,
			aliases,
			group: "editor",
			descriptionKey: `editor.command.${canonical}`,
		});
	}

	// Direct commands: group by canonical action value.
	const directGroups = groupMappingsByCanonical(profile.directCommandMappings);
	for (const [canonical, aliases] of directGroups) {
		descriptors.push({
			verb: canonical,
			aliases,
			group: "direct",
			descriptionKey: `command.description.${canonical}`,
		});
	}

	// Variable command (mirrors V1 VariableCommandProvider).
	if (options.variableName) {
		descriptors.push({
			verb: options.variableName,
			aliases: options.variableAliases ?? [],
			group: "cell",
			descriptionKey: "command.variable",
			args: [],
		});
	}

	// Macro names (MACRO mode).
	if (options.macroNames) {
		for (const name of options.macroNames) {
			descriptors.push({
				verb: name,
				aliases: [],
				group: "macro",
			});
		}
	}

	return descriptors;
}

/**
 * Group a profile mapping (alias→canonical) by canonical verb.
 * Returns a Map<canonical, aliases[]> where aliases excludes the canonical
 * key itself (e.g. `{write: "write", w: "write"}` → `("write", ["w"])`).
 */
function groupMappingsByCanonical(
	mappings: Readonly<Record<string, string>>,
): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	for (const [alias, canonical] of Object.entries(mappings)) {
		if (!groups.has(canonical)) groups.set(canonical, []);
		if (alias !== canonical) {
			groups.get(canonical)?.push(alias);
		}
	}
	return groups;
}
